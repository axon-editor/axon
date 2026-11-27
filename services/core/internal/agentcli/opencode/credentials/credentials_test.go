// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package credentials

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func credentialDatabase(t *testing.T, value string) string {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), "opencode.db")
	database, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer func() {
		_ = database.Close()
	}()

	if _, err := database.Exec(`
		create table credential (
			id text primary key,
			integration_id text,
			value text,
			active integer,
			time_updated integer
		)
	`); err != nil {
		t.Fatalf("create credential table: %v", err)
	}
	if _, err := database.Exec(
		"insert into credential values (?, ?, ?, 1, 1)",
		"cred_1",
		integrationID,
		value,
	); err != nil {
		t.Fatalf("insert credential: %v", err)
	}

	return databasePath
}

func TestReadAPIKeyReturnsStoredKey(t *testing.T) {
	value, err := json.Marshal(map[string]string{
		"type": "key",
		"key":  "oc_sk_test",
	})
	if err != nil {
		t.Fatalf("marshal credential: %v", err)
	}

	if got := ReadAPIKey(credentialDatabase(t, string(value))); got != "oc_sk_test" {
		t.Fatalf("ReadAPIKey = %q", got)
	}
}

func TestReadAPIKeyIgnoresOAuthCredentials(t *testing.T) {
	value, err := json.Marshal(map[string]string{
		"type": "oauth",
		"key":  "unusable",
	})
	if err != nil {
		t.Fatalf("marshal credential: %v", err)
	}

	if got := ReadAPIKey(credentialDatabase(t, string(value))); got != "" {
		t.Fatalf("ReadAPIKey = %q", got)
	}
}

func TestReadAPIKeyMissingDatabase(t *testing.T) {
	if got := ReadAPIKey(filepath.Join(t.TempDir(), "missing.db")); got != "" {
		t.Fatalf("ReadAPIKey = %q", got)
	}
}
