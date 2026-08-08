// Package ptyhost exposes the isolated local server that owns terminal PTYs.
// It deliberately contains no workspace search, indexing, AI, or editor file
// handlers, so those workloads cannot share this process's scheduler, memory
// pressure, or restart lifecycle with a running shell.
package ptyhost

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/terminal"
)

type terminalTicket struct {
	expiresAt     time.Time
	cwd           string
	workspaceRoot string
}

// Server owns short-lived terminal capabilities for one Axon launch.
type Server struct {
	authToken string
	ticketMu  sync.Mutex
	tickets   map[string]terminalTicket
}

// New creates a PTY host protected by the per-launch token Electron supplied.
func New(authToken string) *Server {
	return &Server{
		authToken: strings.TrimSpace(authToken),
		tickets:   make(map[string]terminalTicket),
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

func (s *Server) consumeTicket(ticket string, requestedCwd string, requestedRoot string) bool {
	if ticket == "" {
		return false
	}
	s.ticketMu.Lock()
	capability, exists := s.tickets[ticket]
	delete(s.tickets, ticket)
	s.ticketMu.Unlock()
	if !exists || !time.Now().Before(capability.expiresAt) {
		return false
	}
	return sameFilesystemPath(capability.cwd, requestedCwd) &&
		sameFilesystemPath(capability.workspaceRoot, requestedRoot)
}

func (s *Server) authenticated(r *http.Request) bool {
	if r.URL.Path == "/terminal" {
		return s.consumeTicket(
			strings.TrimSpace(r.URL.Query().Get("ticket")),
			r.URL.Query().Get("cwd"),
			r.URL.Query().Get("workspaceRoot"),
		)
	}
	const bearerPrefix = "Bearer "
	provided := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), bearerPrefix))
	return strings.HasPrefix(r.Header.Get("Authorization"), bearerPrefix) &&
		s.authToken != "" && len(provided) == len(s.authToken) &&
		subtle.ConstantTimeCompare([]byte(provided), []byte(s.authToken)) == 1
}

func (s *Server) requireAuthentication(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authenticated(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{
				"status": "error",
				"error":  "Axon PTY host authentication failed",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if challenge := strings.TrimSpace(r.Header.Get("X-Axon-Challenge")); challenge != "" {
		mac := hmac.New(sha256.New, []byte(s.authToken))
		_, _ = mac.Write([]byte(challenge))
		w.Header().Set("X-Axon-Core-Proof", hex.EncodeToString(mac.Sum(nil)))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"message": "Axon PTY host running",
	})
}

func (s *Server) handleTicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"status": "error", "error": "method not allowed"})
		return
	}
	var body struct {
		Cwd           string `json:"cwd"`
		WorkspaceRoot string `json:"workspaceRoot"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Cwd == "" || body.WorkspaceRoot == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "terminal workspace and working directory are required"})
		return
	}
	rootInfo, rootErr := os.Stat(body.WorkspaceRoot)
	cwdInfo, cwdErr := os.Stat(body.Cwd)
	if rootErr != nil || !rootInfo.IsDir() || cwdErr != nil || !cwdInfo.IsDir() {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "terminal workspace or working directory is invalid"})
		return
	}
	resolvedRoot, rootErr := filepath.EvalSymlinks(body.WorkspaceRoot)
	resolvedCwd, cwdErr := filepath.EvalSymlinks(body.Cwd)
	if rootErr != nil || cwdErr != nil || !pathInsideRoot(resolvedRoot, resolvedCwd) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "error": "terminal working directory is outside its workspace"})
		return
	}

	randomTicket := make([]byte, 32)
	if _, err := rand.Read(randomTicket); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"status": "error", "error": "could not create terminal capability"})
		return
	}
	ticket := base64.RawURLEncoding.EncodeToString(randomTicket)
	now := time.Now()
	s.ticketMu.Lock()
	for value, capability := range s.tickets {
		if !now.Before(capability.expiresAt) {
			delete(s.tickets, value)
		}
	}
	s.tickets[ticket] = terminalTicket{
		expiresAt:     now.Add(15 * time.Second),
		cwd:           resolvedCwd,
		workspaceRoot: resolvedRoot,
	}
	s.ticketMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"data":   map[string]string{"ticket": ticket},
	})
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

// Router exposes only terminal endpoints so PTY ownership remains isolated.
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/terminal", terminal.Handler)
	mux.HandleFunc("/terminal/health", terminal.HealthHandler)
	mux.HandleFunc("/terminal/ticket", s.handleTicket)
	return corsMiddleware(s.requireAuthentication(mux))
}
