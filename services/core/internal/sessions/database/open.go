// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package database

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Database owns the SQLite handle. The rest of the store talks through this
// type so the driver choice and connection policy live in one place.
type Database struct {
	db *sql.DB
}

// Open prepares the session database and applies the schema. A single
// connection is deliberate: sequence allocation and message appends must stay
// ordered, while WAL still lets external tools inspect the file without
// blocking the TUI. busy_timeout covers short-lived readers such as a resume
// invocation racing the current session.
func Open(path string) (*Database, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA busy_timeout=5000",
		"PRAGMA foreign_keys=ON",
	} {
		if _, err := db.Exec(pragma); err != nil {
			_ = db.Close()
			return nil, err
		}
	}

	database := &Database{db: db}
	if err := database.Migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return database, nil
}

func (d *Database) SQL() *sql.DB {
	return d.db
}

func (d *Database) Close() error {
	return d.db.Close()
}
