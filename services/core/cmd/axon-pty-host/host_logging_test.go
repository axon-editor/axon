package main

import (
	"bytes"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConfigureHostLoggingPersistsDiagnostics(t *testing.T) {
	restoreConsoleLog := discardConsoleLog(t)
	defer restoreConsoleLog()

	logPath := filepath.Join(t.TempDir(), "pty-host.log")
	closeLog, err := configureHostLogging(logPath)
	if err != nil {
		t.Fatalf("configure host log: %v", err)
	}
	log.Print("owner pipe connected")
	closeLog()

	contents, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read host log: %v", err)
	}
	if !strings.Contains(string(contents), "owner pipe connected") {
		t.Fatalf("host diagnostic was not persisted: %q", contents)
	}
	info, err := os.Stat(logPath)
	if err != nil {
		t.Fatalf("stat host log: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("expected private log permissions 0600, got %o", info.Mode().Perm())
	}
}

func TestConfigureHostLoggingRotatesBoundedFile(t *testing.T) {
	restoreConsoleLog := discardConsoleLog(t)
	defer restoreConsoleLog()

	logPath := filepath.Join(t.TempDir(), "pty-host.log")
	seedSize := maxHostLogBytes + 1024
	if err := os.WriteFile(logPath, bytes.Repeat([]byte("x"), int(seedSize)), 0600); err != nil {
		t.Fatalf("seed full host log: %v", err)
	}

	closeLog, err := configureHostLogging(logPath)
	if err != nil {
		t.Fatalf("rotate host log: %v", err)
	}
	log.Print("fresh host launch")
	closeLog()

	rotated, err := os.Stat(logPath + ".1")
	if err != nil {
		t.Fatalf("stat rotated host log: %v", err)
	}
	if rotated.Size() != maxHostLogBytes {
		t.Fatalf("expected oversized rotated log to be capped at %d, got %d", maxHostLogBytes, rotated.Size())
	}
	current, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read current host log: %v", err)
	}
	if !strings.Contains(string(current), "fresh host launch") {
		t.Fatalf("new host log did not receive fresh output: %q", current)
	}
}

func TestConfigureHostLoggingRotatesWhileHostIsRunning(t *testing.T) {
	restoreConsoleLog := discardConsoleLog(t)
	defer restoreConsoleLog()

	logPath := filepath.Join(t.TempDir(), "pty-host.log")
	closeLog, err := configureHostLogging(logPath)
	if err != nil {
		t.Fatalf("configure host log: %v", err)
	}

	log.Print(strings.Repeat("a", int(maxHostLogBytes-1024)))
	log.Print(strings.Repeat("b", 2048))
	closeLog()

	rotated, err := os.Stat(logPath + ".1")
	if err != nil {
		t.Fatalf("stat runtime-rotated host log: %v", err)
	}
	current, err := os.Stat(logPath)
	if err != nil {
		t.Fatalf("stat current host log: %v", err)
	}
	if rotated.Size() > maxHostLogBytes {
		t.Fatalf("rotated host log exceeded %d bytes: %d", maxHostLogBytes, rotated.Size())
	}
	if current.Size() > maxHostLogBytes {
		t.Fatalf("current host log exceeded %d bytes: %d", maxHostLogBytes, current.Size())
	}
}

func TestConfigureHostLoggingBoundsSingleOversizedEntry(t *testing.T) {
	restoreConsoleLog := discardConsoleLog(t)
	defer restoreConsoleLog()

	logPath := filepath.Join(t.TempDir(), "pty-host.log")
	closeLog, err := configureHostLogging(logPath)
	if err != nil {
		t.Fatalf("configure host log: %v", err)
	}

	log.Print(strings.Repeat("x", int(maxHostLogBytes+1024)))
	closeLog()

	current, err := os.Stat(logPath)
	if err != nil {
		t.Fatalf("stat current host log: %v", err)
	}
	if current.Size() > maxHostLogBytes {
		t.Fatalf("oversized entry grew host log beyond %d bytes: %d", maxHostLogBytes, current.Size())
	}
}

func discardConsoleLog(t *testing.T) func() {
	t.Helper()
	previousOutput := log.Writer()
	log.SetOutput(io.Discard)
	return func() {
		log.SetOutput(previousOutput)
	}
}
