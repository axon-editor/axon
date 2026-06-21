// HTTP server for axon-core. Registers all routes and holds the top-level
// request handlers. Handlers are intentionally thin, they validate input,
// call the relevant service (fs, ai, etc), and return a consistent response
// envelope. No business logic lives here.
package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/GordenArcher/axon-core/internal/fs"
	"github.com/GordenArcher/axon-core/internal/terminal"
	"github.com/google/uuid"
)

// Server is the core HTTP server struct.
// Will hold shared dependencies (config, ai clients, etc) as we expand.
type Server struct{}

// New creates and returns a new Server instance.
func New() *Server {
	return &Server{}
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

// writeJSON serializes a Response to JSON and writes it to the ResponseWriter.
// Always sets Content-Type to application/json.
// Injects a unique request_id and timestamp into every response automatically
// so callers don't have to think about it.
func writeJSON(w http.ResponseWriter, status int, payload Response) {
	// inject request ID and timestamp on every response
	payload.RequestID = uuid.New().String()
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

	// AI
	mux.HandleFunc("/ai/runtime", s.handleAIRuntime)
	mux.HandleFunc("/ai/models", s.handleAIModels)
	mux.HandleFunc("/ai/project-context", s.handleAIProjectContext)
	mux.HandleFunc("/ai/models/pull/stream", s.handleAIModelPullStream)
	mux.HandleFunc("/ai/chat/stream", s.handleAIChatStream)

	// terminal WebSocket endpoint
	// each connection spawns a real shell attached to a PTY
	mux.HandleFunc("/terminal", terminal.Handler)

	// wrap with CORS, Electron renderer runs on localhost:5173 in dev
	// and as a file:// origin in production, both need to be allowed
	return corsMiddleware(mux)
}

// corsMiddleware allows cross-origin requests from the Electron renderer.
// In dev the renderer is on localhost:5173, in production it's a file:// origin.
// We allow all origins here since axon-core only ever runs locally, it's not
// a public server so there's no security concern with open CORS.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
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

// handleHealth is a simple liveness check endpoint.
// Used by the editor to confirm axon-core is running before making other calls.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
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
	if path == "" {
		writeJSON(w, http.StatusBadRequest, Response{
			Status: "error",
			Error:  "path query parameter is required",
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
		if path == "" {
			writeJSON(w, http.StatusBadRequest, Response{
				Status: "error",
				Error:  "path query parameter is required",
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
		}

		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, Response{
				Status: "error",
				Error:  "invalid request body — expected {path, content}",
			})
			return
		}

		if body.Path == "" {
			writeJSON(w, http.StatusBadRequest, Response{
				Status: "error",
				Error:  "path is required in request body",
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
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}

	if body.Path == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "path is required"})
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
	if path == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "path is required"})
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
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}

	if body.Source == "" || body.TargetDir == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "source and target_dir are required"})
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
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "invalid request body"})
		return
	}

	if body.Source == "" || body.NewName == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "source and new_name are required"})
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
	if rootPath == "" {
		writeJSON(w, http.StatusBadRequest, Response{Status: "error", Error: "root query parameter is required"})
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
