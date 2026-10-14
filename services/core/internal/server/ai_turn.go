// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package server

import (
	"encoding/json"
	"net/http"

	"github.com/GordenArcher/axon-core/internal/ai"
)

// aiRunToolRequest is the payload for POST /ai/run-tool. Only the workspace root
// is needed because project tools read from disk; the caller passes the root it
// already authorized in the editor so the tool cannot escape the workspace.
type aiRunToolRequest struct {
	FolderPath *string         `json:"folderPath"`
	Name       string          `json:"name"`
	Arguments  json.RawMessage `json:"arguments"`
}

type aiRunToolResult struct {
	Name   string `json:"name"`
	Result string `json:"result"`
}

// handleAIChatTurn runs one non-streaming planning turn for a client-owned agent
// loop. The editor calls this between UI actions so it can execute a tool in the
// renderer and feed the result back, then calls /ai/chat/stream for the final
// answer. Keeping the turn non-streaming is deliberate: a partial tool call is
// worse than a small wait inside the loop.
func (s *Server) handleAIChatTurn(w http.ResponseWriter, r *http.Request) {
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

	result, err := ai.PlanTurn(r.Context(), request)
	if err != nil {
		detail := ai.PublicError(err)
		writeAIJSON(w, aiStatusForError(detail), aiErrorEnvelope("", aiStatusForError(detail), detail))
		return
	}

	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope("", http.StatusOK, "AI turn ready.", result))
}

// handleAIToolDefinitions returns the workspace tools axon-core can execute on
// its own. The editor merges these with its renderer-side UI tools into the
// single tool list the model sees, which keeps one source of truth for the
// project tools even though the loop now lives in the Electron main process.
func (s *Server) handleAIToolDefinitions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope("", http.StatusOK, "Tool definitions ready.", ai.ProjectToolDefinitions()))
}

// handleAIRunTool executes a workspace project tool on behalf of the caller-owned
// loop. It is intentionally limited to the project tools axon-core already ships;
// renderer-side UI actions never reach this endpoint because they execute in the
// renderer through IPC, not in core.
func (s *Server) handleAIRunTool(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAIJSON(w, http.StatusMethodNotAllowed, aiErrorEnvelope("", http.StatusMethodNotAllowed, ai.ErrorDetail{
			Field:   "method",
			Code:    "METHOD_NOT_ALLOWED",
			Message: "method not allowed",
		}))
		return
	}

	var request aiRunToolRequest
	limitRequestBody(w, r)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope("", http.StatusBadRequest, ai.ErrorDetail{
			Field:   "body",
			Code:    "INVALID_REQUEST_BODY",
			Message: "invalid request body",
		}))
		return
	}
	if request.Name == "" {
		writeAIJSON(w, http.StatusBadRequest, aiErrorEnvelope("", http.StatusBadRequest, ai.ErrorDetail{
			Field:   "name",
			Code:    "TOOL_NAME_REQUIRED",
			Message: "tool name is required",
		}))
		return
	}

	result := ai.RunProjectTool(r.Context(), ai.ChatRequest{FolderPath: request.FolderPath}, request.Name, request.Arguments)
	writeAIJSON(w, http.StatusOK, aiSuccessEnvelope("", http.StatusOK, "Tool finished.", aiRunToolResult{
		Name:   request.Name,
		Result: result,
	}))
}

// aiStatusForError maps shared user errors to the status the editor already
// branches on for chat. Runtime and model problems are user-actionable, so they
// stay 422; anything else is an unexpected backend failure.
func aiStatusForError(detail ai.ErrorDetail) int {
	switch detail.Code {
	case "RUNTIME_UNAVAILABLE", "MODEL_NOT_INSTALLED":
		return http.StatusUnprocessableEntity
	default:
		return http.StatusInternalServerError
	}
}
