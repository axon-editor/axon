// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package credentials

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"

	_ "modernc.org/sqlite"
)

// OpenCode keeps account credentials inside its own database, not in a config
// file. The CLI runs the managed server on a separate database so Axon
// conversations stay out of the user's OpenCode TUI, so the account key has to
// travel through the environment instead.
const integrationID = "opencode-go"

func DefaultDatabasePath() string {
	if directory := os.Getenv("XDG_DATA_HOME"); directory != "" {
		return filepath.Join(directory, "opencode", "opencode.db")
	}
	if runtime.GOOS == "windows" {
		if directory := os.Getenv("LOCALAPPDATA"); directory != "" {
			return filepath.Join(directory, "opencode", "opencode.db")
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".local", "share", "opencode", "opencode.db")
}

func OpenCodeAPIKey() string {
	return ReadAPIKey(DefaultDatabasePath())
}

// ReadAPIKey is exported so tests can point at a temporary database. Only
// stored API keys can be handed to the managed server; OAuth credentials are
// refreshed through OpenCode's own login flow and cannot be replayed as an
// environment key.
func ReadAPIKey(databasePath string) string {
	if databasePath == "" {
		return ""
	}

	// A missing database, a locked file, or an older schema all mean the same
	// thing here: there is no account key to inject, and the managed server
	// still starts on the free catalog.
	database, err := sql.Open("sqlite", "file:"+databasePath+"?mode=ro")
	if err != nil {
		return ""
	}
	defer func() {
		_ = database.Close()
	}()

	var value string
	err = database.QueryRow(
		"select value from credential where integration_id = ? and active = 1 order by time_updated desc limit 1",
		integrationID,
	).Scan(&value)
	if err != nil {
		return ""
	}

	var credential struct {
		Type string `json:"type"`
		Key  string `json:"key"`
	}
	if err := json.Unmarshal([]byte(value), &credential); err != nil {
		return ""
	}
	if credential.Type != "key" {
		return ""
	}
	return credential.Key
}
