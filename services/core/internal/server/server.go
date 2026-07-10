// HTTP server for axon-core. Registers all routes and holds the top-level
// request handlers. Handlers are intentionally thin, they validate input,
// call the relevant service (fs, ai, etc), and return a consistent response
// envelope. No business logic lives here.
package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/GordenArcher/axon-core/internal/fs"
	"github.com/GordenArcher/axon-core/internal/terminal"
)

// Server is the core HTTP server struct.
// Will hold shared dependencies (config, ai clients, etc) as we expand.
type Server struct {
	authToken       string
	terminalMu      sync.Mutex
	terminalTickets map[string]terminalTicket
}

type terminalTicket struct {
	expiresAt time.Time
	cwd       string
}

// New creates and returns a new Server instance.
func New(authToken string) *Server {
	return &Server{
		authToken:       strings.TrimSpace(authToken),
		terminalTickets: make(map[string]terminalTicket),
	}
}

// Response is the standard envelope for all API responses.
// Every endpoint returns this structure for consistency,
// the editor frontend can always expect the same shape.
//
// Fields:
//   - Status:     "ok" or "error"
//   - Message:    human-readable message (optional, used for success confirmations)
//   - Data:       the actual payload (omitted when nil)
//   - Error:      structured error detail object (omitted when nil)
//   - RequestID:  unique ID per request for debugging/tracing
//   - Timestamp:  UTC time the response was generated
type Response struct {
	Status    string `json:"status"`
	Message   string `json:"message,omitempty"`
	Data      any    `json:"data,omitempty"`
	Error     any    `json:"error,omitempty"`
	RequestID string `json:"request_id"`
	Timestamp string `json:"timestamp"`
}

const maxJSONRequestBodyBytes = 32 << 20

var responseIDCounter uint64

func newResponseID() string {
	// Health checks and tiny filesystem responses are on hot startup paths, so
	// request IDs should not pay for crypto randomness on every response. The
	// counter still gives each local response a useful correlation ID without
	// making `/health` polling depend on `crypto/rand`.
	return "core-" + strconv.FormatUint(atomic.AddUint64(&responseIDCounter, 1), 36)
}

func limitRequestBody(w http.ResponseWriter, r *http.Request) {
	// axon-core is local-only, but every JSON decoder below still reads from an
	// HTTP body. Capping the body here prevents a malformed renderer request or
	// local script from forcing the process to allocate an unbounded payload
	// before validation has a chance to reject it.
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONRequestBodyBytes)
}

func pathInsideWorkspace(rootPath string, candidatePath string) (bool, error) {
	// Destructive file operations must be checked against the workspace root in
	// core, not only in the renderer. The renderer is a UI boundary; this
	// server owns the final filesystem boundary, so it must reject escaped paths
	// even if a bug or crafted IPC call sends an absolute path outside the
	// project.
	cleanRoot, err := filepath.Abs(filepath.Clean(rootPath))
	if err != nil {
		return false, err
	}
	if resolvedRoot, err := filepath.EvalSymlinks(cleanRoot); err == nil {
		cleanRoot = resolvedRoot
	}

	cleanCandidate, err := filepath.Abs(filepath.Clean(candidatePath))
	if err != nil {
		return false, err
	}
	if resolvedCandidate, err := filepath.EvalSymlinks(cleanCandidate); err == nil {
		cleanCandidate = resolvedCandidate
	} else if os.IsNotExist(err) {
		// New files do not have a target inode yet, so EvalSymlinks cannot
		// resolve the full path. Resolving the parent catches the important case:
		// a workspace symlink that points outside the root and would otherwise
		// let a save create or overwrite a file somewhere else.
		resolvedParent, parentErr := filepath.EvalSymlinks(filepath.Dir(cleanCandidate))
		if parentErr == nil {
			cleanCandidate = filepath.Join(resolvedParent, filepath.Base(cleanCandidate))
		}
	}
	relativePath, err := filepath.Rel(cleanRoot, cleanCandidate)
	if err != nil {
		return false, err
	}
	if relativePath == "." {
		return true, nil
	}
	return relativePath != ".." && !strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)), nil
}

func validateWorkspacePath(rootPath string, candidatePath string) error {
	// The renderer sends the active workspace root with every write/delete.
	// Requiring it makes the contract explicit: core will not mutate arbitrary
	// absolute paths unless the caller proves the path belongs to the active
	// project boundary.
	if rootPath == "" {
		return errors.New("workspace root is required")
	}
	if candidatePath == "" {
		return errors.New("path is required")
	}
	rootInfo, err := os.Stat(rootPath)
	if err != nil {
		return errors.New("workspace root does not exist")
	}
	if !rootInfo.IsDir() {
		return errors.New("workspace root must be a directory")
	}
	inside, err := pathInsideWorkspace(rootPath, candidatePath)
	if err != nil {
		return err
	}
	if !inside {
		return errors.New("path is outside the workspace")
	}
	return nil
}

func sameFilesystemPath(firstPath string, secondPath string) bool {
	first, firstErr := filepath.Abs(filepath.Clean(firstPath))
	second, secondErr := filepath.Abs(filepath.Clean(secondPath))
	if firstErr != nil || secondErr != nil {
		return false
	}
	if resolved, err := filepath.EvalSymlinks(first); err == nil {
		first = resolved
	}
	if resolved, err := filepath.EvalSymlinks(second); err == nil {
		second = resolved
	}
	return first == second
}

// writeJSON serializes a Response to JSON and writes it to the ResponseWriter.
// Always sets Content-Type to application/json.
// Injects a unique request_id and timestamp into every response automatically
// so callers don't have to think about it.
func writeJSON(w http.ResponseWriter, status int, payload Response) {
	// inject request ID and timestamp on every response
	payload.RequestID = newResponseID()
	payload.Timestamp = time.Now().UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

// Router registers all routes and returns the http.Handler.
// Routes are grouped by concern, /fs/* for file system, /ai/* for AI (coming soon).
// Wraps the mux with CORS middleware to allow requests from the Electron renderer.
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// system
	mux.HandleFunc("/health", s.handleHealth)

	// file system
	mux.HandleFunc("/fs/tree", s.handleFSTree)
	mux.HandleFunc("/fs/file", s.handleFSFile)

	mux.HandleFunc("/fs/create", s.handleFSCreate)
	mux.HandleFunc("/fs/delete", s.handleFSDelete)
	mux.HandleFunc("/fs/move", s.handleFSMove)
	mux.HandleFunc("/fs/rename", s.handleFSRename)
	mux.HandleFunc("/fs/search", s.handleFSSearch)
	mux.HandleFunc("/fs/replace", s.handleFSReplace)

	// AI
	mux.HandleFunc("/ai/runtime", s.handleAIRuntime)
	mux.HandleFunc("/ai/models", s.handleAIModels)
	mux.HandleFunc("/ai/project-context", s.handleAIProjectContext)
	mux.HandleFunc("/ai/models/pull/stream", s.handleAIModelPullStream)
	mux.HandleFunc("/ai/chat/stream", s.handleAIChatStream)

	// terminal WebSocket endpoint
	// each connection spawns a real shell attached to a PTY
	mux.HandleFunc("/terminal", terminal.Handler)
	mux.HandleFunc("/terminal/health", terminal.HealthHandler)
	mux.HandleFunc("/terminal/ticket", s.handleTerminalTicket)

	// wrap with CORS, Electron renderer runs on localhost:5173 in dev
	// and as a file:// origin in production, both need to be allowed
	return corsMiddleware(s.requireAuthentication(mux))
}

func requestToken(r *http.Request) string {
	const bearerPrefix = "Bearer "
	authorization := r.Header.Get("Authorization")
	if strings.HasPrefix(authorization, bearerPrefix) {
		return strings.TrimSpace(strings.TrimPrefix(authorization, bearerPrefix))
	}

	return ""
}

func (s *Server) consumeTerminalTicket(ticket string, requestedCwd string) bool {
	if ticket == "" {
		return false
	}

	s.terminalMu.Lock()
	defer s.terminalMu.Unlock()
	capability, exists := s.terminalTickets[ticket]
	// A ticket is deleted before the WebSocket upgrade continues. This makes it a
	// true one-use capability: copying a terminal URL from logs, history, or a
	// compromised renderer cannot be replayed to create another shell.
	delete(s.terminalTickets, ticket)
	if !exists || !time.Now().Before(capability.expiresAt) {
		return false
	}
	sameCwd, err := pathInsideWorkspace(capability.cwd, requestedCwd)
	return err == nil && sameCwd && sameFilesystemPath(capability.cwd, requestedCwd)
}

func (s *Server) authenticated(r *http.Request) bool {
	if r.URL.Path == "/terminal" {
		return s.consumeTerminalTicket(
			strings.TrimSpace(r.URL.Query().Get("ticket")),
			r.URL.Query().Get("cwd"),
		)
	}

	providedToken := requestToken(r)
	return s.authToken != "" && len(providedToken) == len(s.authToken) &&
		subtle.ConstantTimeCompare([]byte(providedToken), []byte(s.authToken)) == 1
}

func (s *Server) requireAuthentication(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authenticated(r) {
			writeJSON(w, http.StatusUnauthorized, Response{
				Status: "error",
				Error:  "axon-core authentication failed",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleTerminalTicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}
	var body struct {
		Cwd string `json:"cwd"`
	}
	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Cwd == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "terminal working directory is required"})
		return
	}
	info, err := os.Stat(body.Cwd)
	if err != nil || !info.IsDir() {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "terminal working directory is invalid"})
		return
	}
	resolvedCwd, err := filepath.EvalSymlinks(body.Cwd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "terminal working directory is invalid"})
		return
	}

	randomTicket := make([]byte, 32)
	if _, err := rand.Read(randomTicket); err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: "could not create terminal capability"})
		return
	}
	ticket := base64.RawURLEncoding.EncodeToString(randomTicket)
	now := time.Now()

	s.terminalMu.Lock()
	for value, capability := range s.terminalTickets {
		if !now.Before(capability.expiresAt) {
			delete(s.terminalTickets, value)
		}
	}
	// Fifteen seconds covers normal main-process IPC and WebSocket setup while
	// keeping the capability too short-lived to become a second session secret.
	s.terminalTickets[ticket] = terminalTicket{
		expiresAt: now.Add(15 * time.Second),
		cwd:       resolvedCwd,
	}
	s.terminalMu.Unlock()

	writeJSON(w, http.StatusOK, Response{
		Status: "ok",
		Data:   map[string]string{"ticket": ticket},
	})
}

// corsMiddleware allows only Axon's development and packaged renderer origins.
// Loopback binding prevents LAN access, but origin validation is still required
// because arbitrary websites can try to contact services on a user's localhost.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && !allowedRendererOrigin(origin) {
			writeJSON(w, http.StatusForbidden, Response{Status: "error", Error: "origin is not allowed"})
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func allowedRendererOrigin(origin string) bool {
	switch origin {
	case "null", "file://", "http://127.0.0.1:5173", "http://localhost:5173":
		return true
	default:
		return false
	}
}

// handleHealth is a simple liveness check endpoint.
// Used by the editor to confirm axon-core is running before making other calls.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if challenge := strings.TrimSpace(r.Header.Get("X-Axon-Challenge")); challenge != "" {
		mac := hmac.New(sha256.New, []byte(s.authToken))
		_, _ = mac.Write([]byte(challenge))
		w.Header().Set("X-Axon-Core-Proof", hex.EncodeToString(mac.Sum(nil)))
	}
	writeJSON(w, http.StatusOK, Response{
		Status:  "ok",
		Message: "axon-core running",
	})
}

func (s *Server) handleAIChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	var request ai.ChatRequest
	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope("", http.StatusBadRequest, ai.ErrorDetail{
			Field:   "body",
			Code:    "INVALID_REQUEST_BODY",
			Message: "invalid request body",
		}))
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	requestID := newStreamRequestID()

	// AI streaming is intentionally line-delimited JSON instead of the normal
	// single response write. Each line still uses Axon's normal response
	// envelope so streaming stays compatible with the same client-side response
	// contract as every other core endpoint while tokens move immediately.
	if err := ai.StreamChat(r.Context(), request, func(event ai.StreamEvent) error {
		return writeStreamEnvelope(w, requestID, http.StatusOK, "AI stream event.", event)
	}); err != nil {
		_ = writeStreamErrorEnvelope(w, requestID, http.StatusUnprocessableEntity, ai.PublicError(err))
	}
}

func (s *Server) handleAIRuntime(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	status := ai.EnsureRuntimeStatus(r.Context(), r.URL.Query().Get("model"))
	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope("", http.StatusOK, status.Detail, status))
}

func (s *Server) handleAIModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	models, err := ai.ListModels(r.Context(), r.URL.Query().Get("model"))
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, aiErrorEnvelope("", http.StatusInternalServerError, ai.PublicError(err)))
		return
	}

	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope("", http.StatusOK, "Loaded Axon models.", models))
}

func (s *Server) handleAIProjectContext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	contextPack, err := ai.BuildProjectContext(r.Context(), r.URL.Query().Get("root"))
	if err != nil {
		detail := ai.PublicError(err)
		status := http.StatusInternalServerError
		if detail.Code == "WORKSPACE_REQUIRED" || detail.Code == "WORKSPACE_NOT_FOUND" || detail.Code == "WORKSPACE_NOT_DIRECTORY" {
			status = http.StatusUnprocessableEntity
		}
		writeAIJSON(w, status, aiErrorEnvelope("", status, detail))
		return
	}

	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope("", http.StatusOK, "Loaded project context.", contextPack))
}

func (s *Server) handleAIModelPullStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	var request ai.PullRequest
	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope("", http.StatusBadRequest, ai.ErrorDetail{
			Field:   "body",
			Code:    "INVALID_REQUEST_BODY",
			Message: "invalid request body",
		}))
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	requestID := newStreamRequestID()

	if err := ai.PullModel(r.Context(), request.Model, func(event ai.PullEvent) error {
		return writeStreamEnvelope(w, requestID, http.StatusOK, "Model download progress.", event)
	}); err != nil {
		_ = writeStreamErrorEnvelope(w, requestID, http.StatusUnprocessableEntity, ai.PublicError(err))
	}
}

// handleFSTree handles GET /fs/tree?path=<absolute_path>
// Returns a recursive FileNode tree of the given directory.
// Requires a valid absolute path as a query parameter.
func (s *Server) handleFSTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, Response{
			Status: "error",
			Error:  "method not allowed",
		})
		return
	}

	path := r.URL.Query().Get("path")
	root := r.URL.Query().Get("root")
	if err := validateWorkspacePath(root, path); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}
	tree, err := fs.GetTree(path)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, Response{
		Status: "ok",
		Data:   tree,
	})
}

// handleFSFile handles both reading and writing files.
//
// GET  /fs/file?path=<absolute_path>  — reads and returns file content
// POST /fs/file                        — writes content to a file
//
// Keeping read and write on the same route mirrors REST conventions
// and keeps the route table clean. Method determines the operation.
func (s *Server) handleFSFile(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	case http.MethodGet:
		// read file
		path := r.URL.Query().Get("path")
		root := r.URL.Query().Get("root")
		if err := validateWorkspacePath(root, path); err != nil {
			writeJSON(w, http.StatusBadRequest, Response{
				Status: "error",
				Error:  err.Error(),
			})
			return
		}

		content, err := fs.ReadFile(path)
		if err != nil {
			if errors.Is(err, fs.ErrBinaryFile) {
				writeJSON(w, http.StatusUnsupportedMediaType, Response{
					Status: "error",
					Error:  "This file is binary and cannot be opened in the text editor.",
				})
				return
			}

			writeJSON(w, http.StatusInternalServerError, Response{
				Status: "error",
				Error:  err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, Response{
			Status: "ok",
			Data:   content,
		})

	case http.MethodPost:
		// write file
		var body struct {
			Path    string `json:"path"`
			Content string `json:"content"`
			Root    string `json:"root"`
		}

		limitRequestBody(w, r)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, Response{
				Status: "error",
				Error:  "invalid request body — expected {path, content}",
			})
			return
		}

		if err := validateWorkspacePath(body.Root, body.Path); err != nil {
			status := http.StatusBadRequest
			if err.Error() == "path is outside the workspace" {
				status = http.StatusForbidden
			}
			writeJSON(w, status, Response{
				Status: "error",
				Error:  err.Error(),
			})
			return
		}

		if err := fs.WriteFile(body.Path, body.Content); err != nil {
			writeJSON(w, http.StatusInternalServerError, Response{
				Status: "error",
				Error:  err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, Response{
			Status:  "ok",
			Message: "file saved successfully",
		})

	default:
		writeJSON(w, http.StatusMethodNotAllowed, Response{
			Status: "error",
			Error:  "method not allowed",
		})
	}
}

// handleFSCreate handles POST /fs/create
// Creates a file or directory at the given path.
// Expects { path, is_dir } in the request body.
// Creates all parent directories if they don't exist.
func (s *Server) handleFSCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}

	var body struct {
		Path  string `json:"path"`
		IsDir bool   `json:"is_dir"`
		Root  string `json:"root"`
	}

	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}

	if err := validateWorkspacePath(body.Root, body.Path); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}

	if body.IsDir {
		// create directory and all parents
		if err := os.MkdirAll(body.Path, 0755); err != nil {
			writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
			return
		}
	} else {
		// ensure parent directories exist before creating the file
		if err := os.MkdirAll(filepath.Dir(body.Path), 0755); err != nil {
			writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
			return
		}
		// create empty file
		f, err := os.Create(body.Path)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
			return
		}
		f.Close()
	}

	writeJSON(w, http.StatusOK, Response{Status: "ok", Message: "created successfully"})
}

// handleFSDelete handles DELETE /fs/delete
// Deletes a file or directory at the given path.
// Directories are deleted recursively.
func (s *Server) handleFSDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}

	path := r.URL.Query().Get("path")
	root := r.URL.Query().Get("root")
	if err := validateWorkspacePath(root, path); err != nil {
		status := http.StatusBadRequest
		if err.Error() == "path is outside the workspace" {
			status = http.StatusForbidden
		}
		writeJSON(w, status, Response{Status: "error", Error: err.Error()})
		return
	}
	if sameFilesystemPath(root, path) {
		writeJSON(w, http.StatusForbidden, Response{Status: "error", Error: "workspace root cannot be deleted"})
		return
	}

	if err := os.RemoveAll(path); err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, Response{Status: "ok", Message: "deleted successfully"})
}

// handleFSMove handles POST /fs/move
// Moves a file or directory to a new parent directory.
// Expects { source, target_dir } in the request body.
func (s *Server) handleFSMove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}

	var body struct {
		Source    string `json:"source"`
		TargetDir string `json:"target_dir"`
		Root      string `json:"root"`
	}

	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}

	if body.Source == "" || body.TargetDir == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "source and target_dir are required"})
		return
	}
	if err := validateWorkspacePath(body.Root, body.Source); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}
	if sameFilesystemPath(body.Root, body.Source) {
		writeJSON(w, http.StatusForbidden, Response{Status: "error", Error: "workspace root cannot be moved"})
		return
	}
	if err := validateWorkspacePath(body.Root, body.TargetDir); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}

	if err := fs.MoveEntry(body.Source, body.TargetDir); err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, Response{Status: "ok", Message: "moved successfully"})
}

// handleFSRename handles POST /fs/rename.
// A rename keeps the entry in the same parent directory and changes only the
// final path segment. Keeping it separate from /fs/move makes the renderer
// contract explicit and prevents a "rename" UI from silently moving files
// between folders.
func (s *Server) handleFSRename(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}

	var body struct {
		Source  string `json:"source"`
		NewName string `json:"new_name"`
		Root    string `json:"root"`
	}

	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}

	if body.Source == "" || body.NewName == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "source and new_name are required"})
		return
	}
	if body.NewName != filepath.Base(body.NewName) || body.NewName == "." || body.NewName == ".." {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "new_name must be one file name"})
		return
	}
	if err := validateWorkspacePath(body.Root, body.Source); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}
	if sameFilesystemPath(body.Root, body.Source) {
		writeJSON(w, http.StatusForbidden, Response{Status: "error", Error: "workspace root cannot be renamed"})
		return
	}
	if err := validateWorkspacePath(body.Root, filepath.Join(filepath.Dir(body.Source), body.NewName)); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}

	newPath, err := fs.RenameEntry(body.Source, body.NewName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, Response{
		Status:  "ok",
		Message: "renamed successfully",
		Data: map[string]string{
			"path": newPath,
		},
	})
}

// handleFSSearch handles GET /fs/search?root=<absolute_path>&q=<query>.
// Workspace search belongs in core because it can walk the local filesystem
// directly and return compact match records, instead of forcing the renderer to
// fetch and scan every file over HTTP.
func (s *Server) handleFSSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}

	rootPath := r.URL.Query().Get("root")
	query := r.URL.Query().Get("q")
	if err := validateWorkspacePath(rootPath, rootPath); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}

	results, err := fs.SearchWorkspaceContext(r.Context(), rootPath, query, 80)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, Response{
		Status: "ok",
		Data:   results,
	})
}

func (s *Server) handleFSReplace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, Response{Status: "error", Error: "method not allowed"})
		return
	}

	var body struct {
		Root        string `json:"root"`
		Search      string `json:"search"`
		Replacement string `json:"replacement"`
	}
	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}
	if err := validateWorkspacePath(body.Root, body.Root); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: err.Error()})
		return
	}
	if body.Search == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "search text is required"})
		return
	}

	result, err := fs.ReplaceWorkspaceContext(r.Context(), body.Root, body.Search, body.Replacement)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, Response{Status: "error", Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, Response{Status: "ok", Data: result})
}
