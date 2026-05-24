// HTTP server for axon-core. Registers all routes and holds the top-level
// request handlers. Handlers are intentionally thin, they validate input,
// call the relevant service (fs, ai, etc), and return a consistent response
// envelope. No business logic lives here.
package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/GordenArcher/axon-core/internal/fs"
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
//   - Error:      error detail string (omitted when empty)
//   - RequestID:  unique ID per request for debugging/tracing
//   - Timestamp:  UTC time the response was generated
type Response struct {
	Status    string `json:"status"`
	Message   string `json:"message,omitempty"`
	Data      any    `json:"data,omitempty"`
	Error     string `json:"error,omitempty"`
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
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// system
	mux.HandleFunc("/health", s.handleHealth)

	// file system
	mux.HandleFunc("/fs/tree", s.handleFSTree)
	mux.HandleFunc("/fs/file", s.handleFSFile)

	return mux
}

// handleHealth is a simple liveness check endpoint.
// Used by the editor to confirm axon-core is running before making other calls.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, Response{
		Status:  "ok",
		Message: "axon-core running",
	})
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
