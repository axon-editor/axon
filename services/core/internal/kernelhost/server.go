// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package kernelhost

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// upgrader mirrors the terminal host's origin allow-list. Authentication and
// origin checks defend different boundaries: the ticket proves the workspace, and
// the origin list stops an unrelated browser page from driving a kernel even if a
// ticket leaks into a URL.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		switch r.Header.Get("Origin") {
		case "", "null", "file://", "http://127.0.0.1:5173", "http://localhost:5173":
			return true
		default:
			return false
		}
	},
}

const (
	ticketTTL     = 15 * time.Second
	idleReapAfter = 10 * time.Minute
	reapInterval  = time.Minute
	websocketPing = 25 * time.Second
	websocketWait = 30 * time.Second
	websocketRead = 1 << 20
)

type kernelTicket struct {
	expiresAt time.Time
	spec      kernelSpec
}

// Server owns short-lived kernel capabilities and the live kernels for one Axon
// launch. Kernels outlive an individual WebSocket so a renderer reload reattaches
// to the same interpreter instead of losing all notebook state.
type Server struct {
	authToken string

	ticketMu sync.Mutex
	tickets  map[string]kernelTicket

	kernelMu sync.Mutex
	kernels  map[string]*Kernel
}

// New creates a kernel host protected by the per-launch token Electron supplied.
func New(authToken string) *Server {
	return &Server{
		authToken: strings.TrimSpace(authToken),
		tickets:   map[string]kernelTicket{},
		kernels:   map[string]*Kernel{},
	}
}

func pathInsideRoot(rootPath string, candidatePath string) bool {
	root, rootErr := filepath.Abs(filepath.Clean(rootPath))
	candidate, candidateErr := filepath.Abs(filepath.Clean(candidatePath))
	if rootErr != nil || candidateErr != nil {
		return false
	}
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator)))
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

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) consumeTicket(sessionID string, ticket string) (kernelSpec, bool) {
	if ticket == "" {
		return kernelSpec{}, false
	}
	s.ticketMu.Lock()
	record, ok := s.tickets[ticket]
	delete(s.tickets, ticket)
	s.ticketMu.Unlock()
	if !ok || time.Now().After(record.expiresAt) {
		return kernelSpec{}, false
	}
	if sessionID != "" && sessionID != record.spec.SessionID {
		return kernelSpec{}, false
	}
	return record.spec, true
}

func (s *Server) authorized(w http.ResponseWriter, r *http.Request) bool {
	header := r.Header.Get("Authorization")
	provided := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	if !strings.HasPrefix(header, "Bearer ") || s.authToken == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"status": "error", "error": "Axon kernel host authentication failed"})
		return false
	}
	if len(provided) != len(s.authToken) || subtle.ConstantTimeCompare([]byte(provided), []byte(s.authToken)) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"status": "error", "error": "Axon kernel host authentication failed"})
		return false
	}
	return true
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if challenge := strings.TrimSpace(r.Header.Get("X-Axon-Challenge")); challenge != "" {
		mac := hmac.New(sha256.New, []byte(s.authToken))
		_, _ = mac.Write([]byte(challenge))
		w.Header().Set("X-Axon-Core-Proof", hex.EncodeToString(mac.Sum(nil)))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"message": "Axon kernel host running",
	})
}

// handleTicket validates a notebook open against its workspace and issues a
// one-shot capability. The path checks are the same boundary the filesystem proxy
// enforces, so a ticket can only ever launch a kernel inside a folder the renderer
// already has open.
func (s *Server) handleTicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"status": "error", "error": "method not allowed"})
		return
	}
	var body struct {
		SessionID     string `json:"sessionId"`
		Cwd           string `json:"cwd"`
		WorkspaceRoot string `json:"workspaceRoot"`
		NotebookPath  string `json:"notebookPath"`
		Interpreter   string `json:"interpreter"`
		KernelName    string `json:"kernelName"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "invalid kernel ticket request"})
		return
	}
	if body.SessionID == "" || body.Cwd == "" || body.WorkspaceRoot == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "kernel session and workspace are required"})
		return
	}

	rootInfo, rootErr := os.Stat(body.WorkspaceRoot)
	cwdInfo, cwdErr := os.Stat(body.Cwd)
	if rootErr != nil || !rootInfo.IsDir() || cwdErr != nil || !cwdInfo.IsDir() {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "kernel workspace or working directory is invalid"})
		return
	}
	resolvedRoot, rootErr := filepath.EvalSymlinks(body.WorkspaceRoot)
	resolvedCwd, cwdErr := filepath.EvalSymlinks(body.Cwd)
	if rootErr != nil || cwdErr != nil || !pathInsideRoot(resolvedRoot, resolvedCwd) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "kernel working directory is outside its workspace"})
		return
	}
	if body.NotebookPath == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "kernel ticket requires a notebook path"})
		return
	}
	// The notebook itself may not exist yet, so resolve its containing directory
	// before comparing against the workspace root. Without this, a workspace under
	// a symlinked prefix (for example /var -> /private/var on macOS) would reject
	// every legitimate notebook as "outside its workspace".
	resolvedNotebook, notebookErr := resolvePathTarget(body.NotebookPath)
	if notebookErr != nil || !pathInsideRoot(resolvedRoot, resolvedNotebook) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "notebook is outside its workspace"})
		return
	}
	if body.Interpreter != "" {
		info, err := os.Stat(body.Interpreter)
		if err != nil || info.IsDir() {
			writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "kernel interpreter is invalid"})
			return
		}
	}

	kernelName := strings.TrimSpace(body.KernelName)
	if kernelName == "" {
		kernelName = "python3"
	}

	randomTicket := make([]byte, 32)
	if _, err := rand.Read(randomTicket); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"status": "error", "error": "could not create kernel capability"})
		return
	}
	ticket := base64.RawURLEncoding.EncodeToString(randomTicket)
	now := time.Now()
	s.ticketMu.Lock()
	for value, record := range s.tickets {
		if now.After(record.expiresAt) {
			delete(s.tickets, value)
		}
	}
	s.tickets[ticket] = kernelTicket{
		expiresAt: now.Add(ticketTTL),
		spec: kernelSpec{
			SessionID:     body.SessionID,
			Cwd:           resolvedCwd,
			WorkspaceRoot: resolvedRoot,
			NotebookPath:  resolvedNotebook,
			Interpreter:   body.Interpreter,
			KernelName:    kernelName,
		},
	}
	s.ticketMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"data":   map[string]string{"ticket": ticket},
	})
}

// kernelForSession returns the running kernel for a session or creates one. A
// closed kernel is discarded so a crashed process cannot be reattached to.
func (s *Server) kernelForSession(ctx context.Context, spec kernelSpec) (*Kernel, error) {
	s.kernelMu.Lock()
	existing := s.kernels[spec.SessionID]
	if existing != nil && !existing.isClosed() {
		s.kernelMu.Unlock()
		return existing, nil
	}
	s.kernelMu.Unlock()

	kernel, err := newKernel(ctx, spec)
	if err != nil {
		return nil, err
	}
	s.kernelMu.Lock()
	// Another connection may have won the race; prefer the registered kernel so a
	// single session never owns two interpreter processes.
	if winner := s.kernels[spec.SessionID]; winner != nil && !winner.isClosed() {
		s.kernelMu.Unlock()
		kernel.Close()
		return winner, nil
	}
	s.kernels[spec.SessionID] = kernel
	s.kernelMu.Unlock()
	return kernel, nil
}

func (s *Server) removeKernel(sessionID string, kernel *Kernel) {
	s.kernelMu.Lock()
	if s.kernels[sessionID] == kernel {
		delete(s.kernels, sessionID)
	}
	s.kernelMu.Unlock()
}

// StartReaper shuts down kernels that no view has attached to for a while. A
// renderer crash should not leave an interpreter holding memory for the rest of
// the app's life.
func (s *Server) StartReaper(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(reapInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cutoff := time.Now().Add(-idleReapAfter)
				s.kernelMu.Lock()
				sessions := make([]string, 0, len(s.kernels))
				kernels := make([]*Kernel, 0, len(s.kernels))
				for sessionID, kernel := range s.kernels {
					sessions = append(sessions, sessionID)
					kernels = append(kernels, kernel)
				}
				s.kernelMu.Unlock()
				for index, kernel := range kernels {
					if kernel.idleSince(cutoff) {
						kernel.Close()
						s.removeKernel(sessions[index], kernel)
						log.Printf("reaped idle notebook kernel %s", sessions[index])
					}
				}
			}
		}
	}()
}

// CloseAll tears every kernel down, used on owner loss.
func (s *Server) CloseAll() {
	s.kernelMu.Lock()
	kernels := s.kernels
	s.kernels = map[string]*Kernel{}
	s.kernelMu.Unlock()
	for _, kernel := range kernels {
		kernel.Close()
	}
}

// websocketAttachment serializes writes to a single renderer socket. IOPub
// forwarding and reply forwarding run on different goroutines, and gorilla allows
// only one concurrent writer.
type websocketAttachment struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (a *websocketAttachment) send(payload []byte) {
	a.mu.Lock()
	defer a.mu.Unlock()
	_ = a.conn.SetWriteDeadline(time.Now().Add(websocketWait))
	_ = a.conn.WriteMessage(websocket.TextMessage, payload)
}

func (s *Server) handleKernel(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	spec, ok := s.consumeTicket(sessionID, r.URL.Query().Get("ticket"))
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"status": "error", "error": "kernel capability is invalid or expired"})
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("kernel ws upgrade error: %v", err)
		return
	}
	defer ws.Close()
	ws.SetReadLimit(websocketRead)
	_ = ws.SetReadDeadline(time.Now().Add(websocketPing + 45*time.Second))
	ws.SetPongHandler(func(string) error {
		return ws.SetReadDeadline(time.Now().Add(websocketPing + 45*time.Second))
	})

	kernel, err := s.kernelForSession(r.Context(), spec)
	if err != nil {
		attachment := &websocketAttachment{conn: ws}
		attachment.send(mustMarshal(serverMessage{Type: serverError, Message: err.Error()}))
		return
	}

	attachment := &websocketAttachment{conn: ws}
	kernel.attach(attachment)
	defer kernel.detach(attachment)

	stopPing := startAttachmentPing(attachment, ws)
	defer stopPing()

	for {
		_, data, err := ws.ReadMessage()
		if err != nil {
			return
		}
		var message clientMessage
		if err := json.Unmarshal(data, &message); err != nil {
			attachment.send(mustMarshal(serverMessage{Type: serverError, Message: "invalid kernel message"}))
			continue
		}
		s.dispatch(r.Context(), kernel, attachment, message)
	}
}

func (s *Server) dispatch(ctx context.Context, kernel *Kernel, attachment attachment, message clientMessage) {
	switch message.Type {
	case clientExecute:
		if message.ID == "" {
			attachment.send(mustMarshal(serverMessage{Type: serverError, Message: "execute requires an id"}))
			return
		}
		kernel.handleExecute(attachment, message.ID, message.Code)
	case clientInterrupt:
		kernel.Interrupt(ctx)
	case clientRestart:
		if err := kernel.Restart(ctx); err != nil {
			attachment.send(mustMarshal(serverMessage{Type: serverError, Message: err.Error()}))
		}
	case clientShutdown:
		kernel.Shutdown(ctx)
		s.removeKernel(kernel.spec.SessionID, kernel)
	default:
		attachment.send(mustMarshal(serverMessage{Type: serverError, Message: "unknown kernel message type"}))
	}
}

func startAttachmentPing(attachment *websocketAttachment, ws *websocket.Conn) func() {
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(websocketPing)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				attachment.mu.Lock()
				err := ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(websocketWait))
				attachment.mu.Unlock()
				if err != nil {
					return
				}
			}
		}
	}()
	return func() { close(done) }
}

func allowedOrigin(origin string) bool {
	switch origin {
	case "", "null", "file://", "http://127.0.0.1:5173", "http://localhost:5173":
		return true
	default:
		return false
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if !allowedOrigin(origin) {
			writeJSON(w, http.StatusForbidden, map[string]any{"status": "error", "error": "origin is not allowed"})
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// StreamRouter exposes only the WebSocket data path. Health and ticket creation
// travel over the private control socket in packaged builds, so reusable
// credentials never ride alongside kernel traffic.
func (s *Server) StreamRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/kernel", s.handleKernel)
	return corsMiddleware(mux)
}

// ControlRouter serves low-volume authenticated control traffic over a private
// Unix socket or Windows named pipe. It has no WebSocket route; the streaming
// path lives on the loopback stream listener.
func (s *Server) ControlRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/kernel/ticket", s.handleTicket)
	return s.requireBearer(mux)
}

// Router combines stream and control routes for local development and tests that
// intentionally run the host on one disposable loopback listener. The /kernel
// WebSocket is authorized by its one-shot ticket inside the handler, while every
// other route requires the launch bearer.
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/kernel", s.handleKernel)
	mux.HandleFunc("/kernel/ticket", s.handleTicket)
	return corsMiddleware(s.requireAuthentication(mux))
}

// resolvePathTarget canonicalises a path whose file may not exist yet by resolving
// symlinks on its nearest existing ancestor, then reattaching the remaining
// segments. This keeps containment checks honest on platforms where the temp or
// home roots are symlinked.
func resolvePathTarget(target string) (string, error) {
	absolute, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(absolute); err == nil {
		return resolved, nil
	}
	parent := filepath.Dir(absolute)
	resolvedParent, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", err
	}
	return filepath.Join(resolvedParent, filepath.Base(absolute)), nil
}

func (s *Server) requireBearer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authorized(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireAuthentication accepts either a bearer token or, for the WebSocket path,
// the one-shot ticket handleKernel validates itself. This is the dev-mode
// equivalent of the split stream/control transports in a packaged launch.
func (s *Server) requireAuthentication(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/kernel" {
			next.ServeHTTP(w, r)
			return
		}
		s.requireBearer(next).ServeHTTP(w, r)
	})
}
