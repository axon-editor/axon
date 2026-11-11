// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package editorimport

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/sessions/session"
)

const markerName = "editor-imported"

// Store is the subset of the shared store the importer needs. Keeping it small
// avoids an import cycle with the parent package while still using the normal
// upsert path and workspace normalization.
type Store interface {
	Source(id string) (string, error)
	UpsertSession(session.Session) error
	SetActive(workspace, conversationID string) error
}

type storedConversationFile struct {
	Version       int             `json:"version"`
	WorkspacePath string          `json:"workspacePath"`
	Conversation  json.RawMessage `json:"conversation"`
}

type conversationMeta struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	BackendSessionID string `json:"backendSessionId"`
	Action           string `json:"action"`
	CreatedAt        int64  `json:"createdAt"`
	UpdatedAt        int64  `json:"updatedAt"`
	Pinned           bool   `json:"pinned"`
}

type workspaceIndex struct {
	ActiveID string `json:"activeId"`
}

// Run imports the editor's per-workspace JSON files once. The marker lives next
// to sessions.db, so a new Core or CLI can populate the shared database even
// before the new editor has launched.
func Run(root string, store Store) error {
	marker := filepath.Join(root, markerName)
	if _, err := os.Stat(marker); err == nil {
		return nil
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		importWorkspace(filepath.Join(root, entry.Name()), store)
	}

	return os.WriteFile(
		marker,
		[]byte(time.Now().UTC().Format(time.RFC3339)),
		0o600,
	)
}

func importWorkspace(directory string, store Store) {
	activeID := readActiveID(directory)
	workspacePath := ""

	entries, err := os.ReadDir(directory)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "conversation-") ||
			!strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(directory, entry.Name()))
		if err != nil {
			continue
		}
		var file storedConversationFile
		if err := json.Unmarshal(raw, &file); err != nil {
			continue
		}
		if workspacePath == "" {
			workspacePath = file.WorkspacePath
		}
		if len(file.Conversation) == 0 || !json.Valid(file.Conversation) {
			continue
		}
		var meta conversationMeta
		if err := json.Unmarshal(file.Conversation, &meta); err != nil {
			continue
		}
		if strings.TrimSpace(meta.ID) == "" {
			continue
		}
		if source, err := store.Source(meta.ID); err == nil && source != "" {
			continue
		}

		created := time.UnixMilli(meta.CreatedAt)
		if meta.CreatedAt == 0 {
			created = time.Now()
		}
		updated := time.UnixMilli(meta.UpdatedAt)
		if meta.UpdatedAt == 0 {
			updated = time.Now()
		}
		_ = store.UpsertSession(session.Session{
			ID:               meta.ID,
			Workspace:        file.WorkspacePath,
			Title:            meta.Title,
			BackendSessionID: meta.BackendSessionID,
			Action:           meta.Action,
			Source:           "editor",
			Payload:          string(file.Conversation),
			CreatedAt:        created,
			UpdatedAt:        updated,
			Pinned:           meta.Pinned,
		})
	}

	if activeID != "" && workspacePath != "" {
		_ = store.SetActive(workspacePath, activeID)
	}
}

func readActiveID(directory string) string {
	raw, err := os.ReadFile(filepath.Join(directory, "index.json"))
	if err != nil {
		return ""
	}
	var index workspaceIndex
	if err := json.Unmarshal(raw, &index); err != nil {
		return ""
	}
	return index.ActiveID
}
