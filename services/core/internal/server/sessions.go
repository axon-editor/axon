// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/GordenArcher/axon-core/internal/sessions"
)

type sessionConversationMeta struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	Model            string `json:"model,omitempty"`
	Provider         string `json:"provider,omitempty"`
	BackendSessionID string `json:"backendSessionId,omitempty"`
	Action           string `json:"action,omitempty"`
	CreatedAt        int64  `json:"createdAt"`
	UpdatedAt        int64  `json:"updatedAt"`
	Pinned           bool   `json:"pinned"`
}

type sessionsWorkspaceRequest struct {
	FolderPath    *string           `json:"folderPath"`
	ActiveID      string            `json:"activeId"`
	Conversations []json.RawMessage `json:"conversations"`
}

type sessionsConversationRequest struct {
	FolderPath   *string         `json:"folderPath"`
	ActiveID     string          `json:"activeId"`
	Conversation json.RawMessage `json:"conversation"`
}

// handleSessionsWorkspace is the editor's snapshot endpoint. GET returns the
// full conversations for one workspace so a file-based client can migrate in
// one call; POST replaces the workspace snapshot after each debounced save.
func (s *Server) handleSessionsWorkspace(w http.ResponseWriter, r *http.Request) {
	if s.sessionStore == nil {
		writeAIJSON(w, http.StatusServiceUnavailable, aiErrorEnvelope(
			"",
			http.StatusServiceUnavailable,
			ai.ErrorDetail{Code: "SESSION_STORE_UNAVAILABLE", Message: "session store is unavailable"},
		))
		return
	}

	switch r.Method {
	case http.MethodGet:
		workspace := r.URL.Query().Get("path")
		records, err := s.sessionStore.ListFull(workspace)
		if err != nil {
			writeAIJSON(w, http.StatusInternalServerError, aiErrorEnvelope(
				"", http.StatusInternalServerError,
				ai.ErrorDetail{Code: "SESSION_LIST_FAILED", Message: err.Error()},
			))
			return
		}
		active, err := s.sessionStore.Active(workspace)
		if err != nil {
			writeAIJSON(w, http.StatusInternalServerError, aiErrorEnvelope(
				"", http.StatusInternalServerError,
				ai.ErrorDetail{Code: "SESSION_ACTIVE_FAILED", Message: err.Error()},
			))
			return
		}

		conversations := make([]json.RawMessage, 0, len(records))
		for _, record := range records {
			if record.Payload == "" || !json.Valid([]byte(record.Payload)) {
				continue
			}
			conversations = append(conversations, json.RawMessage(record.Payload))
		}
		writeAIJSON(w, http.StatusOK, aiSuccessEnvelope(
			"", http.StatusOK, "Conversations ready.",
			map[string]any{"activeId": active, "conversations": conversations},
		))
	case http.MethodPost:
		var request sessionsWorkspaceRequest
		limitRequestBody(w, r)
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope(
				"", http.StatusBadRequest,
				ai.ErrorDetail{Field: "body", Code: "INVALID_REQUEST_BODY", Message: "invalid request body"},
			))
			return
		}
		workspace := workspaceValue(request.FolderPath)
		for _, conversation := range request.Conversations {
			if err := s.upsertEditorConversation(workspace, conversation); err != nil {
				writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope(
					"", http.StatusBadRequest,
					ai.ErrorDetail{Field: "conversations", Code: "SESSION_SAVE_FAILED", Message: err.Error()},
				))
				return
			}
		}
		if err := s.sessionStore.SetActive(workspace, request.ActiveID); err != nil {
			writeAIJSON(w, http.StatusInternalServerError, aiErrorEnvelope(
				"", http.StatusInternalServerError,
				ai.ErrorDetail{Code: "SESSION_ACTIVE_FAILED", Message: err.Error()},
			))
			return
		}
		writeAIJSON(w, http.StatusOK, aiSuccessEnvelope(
			"", http.StatusOK, "Conversations saved.", nil,
		))
	default:
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope(
			"", http.StatusMethodNotAllowed,
			ai.ErrorDetail{Code: "METHOD_NOT_ALLOWED", Message: "method not allowed"},
		))
	}
}

func (s *Server) handleSessionsConversation(w http.ResponseWriter, r *http.Request) {
	if s.sessionStore == nil {
		writeAIJSON(w, http.StatusServiceUnavailable, aiErrorEnvelope(
			"", http.StatusServiceUnavailable,
			ai.ErrorDetail{Code: "SESSION_STORE_UNAVAILABLE", Message: "session store is unavailable"},
		))
		return
	}
	if r.Method != http.MethodPost {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope(
			"", http.StatusMethodNotAllowed,
			ai.ErrorDetail{Code: "METHOD_NOT_ALLOWED", Message: "method not allowed"},
		))
		return
	}

	var request sessionsConversationRequest
	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope(
			"", http.StatusBadRequest,
			ai.ErrorDetail{Field: "body", Code: "INVALID_REQUEST_BODY", Message: "invalid request body"},
		))
		return
	}

	workspace := workspaceValue(request.FolderPath)
	if err := s.upsertEditorConversation(workspace, request.Conversation); err != nil {
		writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope(
			"", http.StatusBadRequest,
			ai.ErrorDetail{Field: "conversation", Code: "SESSION_SAVE_FAILED", Message: err.Error()},
		))
		return
	}
	if err := s.sessionStore.SetActive(workspace, request.ActiveID); err != nil {
		writeAIJSON(w, http.StatusInternalServerError, aiErrorEnvelope(
			"", http.StatusInternalServerError,
			ai.ErrorDetail{Code: "SESSION_ACTIVE_FAILED", Message: err.Error()},
		))
		return
	}
	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope(
		"", http.StatusOK, "Conversation saved.", nil,
	))
}

func (s *Server) upsertEditorConversation(
	workspace string,
	raw json.RawMessage,
) error {
	if len(raw) == 0 || !json.Valid(raw) {
		return errInvalidConversation
	}

	var meta sessionConversationMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return err
	}
	if strings.TrimSpace(meta.ID) == "" {
		return errInvalidConversation
	}
	created := time.UnixMilli(meta.CreatedAt)
	if meta.CreatedAt == 0 {
		created = time.Now()
	}
	updated := time.UnixMilli(meta.UpdatedAt)
	if meta.UpdatedAt == 0 {
		updated = time.Now()
	}
	// A CLI conversation stays CLI-owned even when the editor rewrites the
	// workspace snapshot. The CLI uses its normalized rows, which the editor's
	// normalizer cannot truncate, while the editor still gets the payload view.
	source := "editor"
	if existing, err := s.sessionStore.Source(meta.ID); err == nil && existing == "cli" {
		source = "cli"
	}
	record := sessions.Session{
		ID:               meta.ID,
		Workspace:        workspace,
		Title:            meta.Title,
		Model:            meta.Model,
		Provider:         meta.Provider,
		BackendSessionID: meta.BackendSessionID,
		Action:           meta.Action,
		Source:           source,
		Payload:          string(raw),
		CreatedAt:        created,
		UpdatedAt:        updated,
		Pinned:           meta.Pinned,
	}
	return s.sessionStore.UpsertSession(record)
}

func workspaceValue(folderPath *string) string {
	if folderPath == nil {
		return ""
	}
	return strings.TrimSpace(*folderPath)
}

var errInvalidConversation = &sessionError{"invalid conversation"}

type sessionError struct {
	message string
}

func (e *sessionError) Error() string {
	return e.message
}
