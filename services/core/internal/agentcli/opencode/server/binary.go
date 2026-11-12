// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package server

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const detectTimeout = 5 * time.Second

// Binary is the resolved CLI path plus the version used in runtime copy. The
// version is cached with the path because probing every candidate on each
// refresh is expensive and the install does not move while the TUI is open.
type Binary struct {
	Path    string
	Version string
}

var (
	binaryMu     sync.Mutex
	cachedBinary *Binary
	binaryExpiry time.Time
)

// Negative results are not cached. A user can install OpenCode from another
// terminal while the agent is running, and the next catalog refresh has to see
// it without restarting the TUI.
const binaryCacheTTL = 30 * time.Second

// Detect finds an installed OpenCode CLI. The explicit candidates matter
// because terminals launched from a desktop app do not always inherit the
// shell PATH, and ~/.opencode/bin is the default install location.
func Detect() (*Binary, error) {
	binaryMu.Lock()
	defer binaryMu.Unlock()

	if cachedBinary != nil && time.Now().Before(binaryExpiry) {
		if _, err := os.Stat(cachedBinary.Path); err == nil {
			return cachedBinary, nil
		}
		cachedBinary = nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	candidates := []string{"opencode"}
	if home != "" {
		if runtime.GOOS == "windows" {
			candidates = append(candidates, filepath.Join(home, ".opencode", "bin", "opencode.exe"))
		} else {
			candidates = append(candidates,
				filepath.Join(home, ".opencode", "bin", "opencode"),
				"/opt/homebrew/bin/opencode",
				"/usr/local/bin/opencode",
				"/usr/bin/opencode",
			)
		}
	}

	for _, candidate := range candidates {
		if strings.ContainsRune(candidate, os.PathSeparator) {
			if _, err := os.Stat(candidate); err != nil {
				continue
			}
		}
		resolved, err := exec.LookPath(candidate)
		if err != nil {
			continue
		}
		version, err := versionOf(resolved)
		if err != nil {
			continue
		}
		binary := &Binary{Path: resolved, Version: version}
		cachedBinary = binary
		binaryExpiry = time.Now().Add(binaryCacheTTL)
		return binary, nil
	}
	return nil, errors.New("OpenCode is not installed")
}

// versionOf rejects candidates that answer the version probe. A random binary
// named opencode is worse than no binary because every later API call fails
// with a confusing protocol error.
func versionOf(path string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), detectTimeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, path, "--version").Output()
	if err != nil {
		return "", err
	}
	version := strings.TrimSpace(string(output))
	if version == "" {
		return "", errors.New("OpenCode did not report a version")
	}
	return version, nil
}
