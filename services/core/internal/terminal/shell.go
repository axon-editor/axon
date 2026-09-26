// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package terminal

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ResolveShellPath reports the shell the terminal would actually start.
//
// A desktop app launched from Finder or the Start menu inherits a minimal
// environment, so SHELL is frequently missing or points at a login shell the user
// never runs. The terminal has to fall back to something real, and the same
// answer has to reach the editor, which reads that shell's history file to offer
// inline command suggestions. Resolving it in one place keeps the running shell and
// the history file from drifting apart.
func ResolveShellPath() string {
	shell := os.Getenv("SHELL")
	if shell == "" || !filepath.IsAbs(shell) {
		shell = "/bin/zsh"
	}
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/bash"
	}
	return shell
}

func createShellCommand(cwd string) *exec.Cmd {
	shell := ResolveShellPath()

	cmd := exec.Command(shell, shellStartupArgs(shell)...)
	cmd.Env = terminalEnvironment()
	cmd.Dir = resolveWorkingDirectory(cwd)
	return cmd
}

// ShellHandler reports the shell this host starts, so the editor can read that
// shell's history file for inline command suggestions instead of guessing from an
// environment the desktop launcher may have stripped.
func ShellHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	payload := map[string]any{
		"status": "ok",
		"data":   map[string]string{"shell": ResolveShellPath()},
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func shellStartupArgs(shellPath string) []string {
	// Axon is launched from a GUI app more often than a login terminal. On macOS
	// that means the process can miss the user's normal shell startup files,
	// which is why commands like npm, pnpm, bun, or go may exist in Terminal.app
	// but not in Axon's integrated terminal. Starting the shell as login +
	// interactive gives zsh/bash the same chance to load profile files that a
	// normal developer terminal gets.
	switch filepath.Base(shellPath) {
	case "zsh":
		return []string{"-l", "-i"}
	case "bash":
		return []string{"--login", "-i"}
	default:
		return nil
	}
}

func terminalEnvironment() []string {
	// A conservative PATH fallback is added before the shell reads profile files
	// because packaged desktop apps often inherit a tiny launchd PATH. Profile
	// files can add nvm/asdf-specific paths afterward, but this baseline covers
	// common Homebrew, Go, Cargo, Bun, and local-bin installs so basic commands
	// are not missing before the user's shell customizations run.
	env := os.Environ()
	pathValue := os.Getenv("PATH")
	if pathValue == "" {
		pathValue = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	}

	home, _ := os.UserHomeDir()
	extraPaths := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	}
	if home != "" {
		extraPaths = append(extraPaths,
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, "bin"),
			filepath.Join(home, "go", "bin"),
			filepath.Join(home, ".cargo", "bin"),
			filepath.Join(home, ".bun", "bin"),
			filepath.Join(home, ".npm-global", "bin"),
		)
	}

	seen := map[string]bool{}
	parts := []string{}
	for entry := range strings.SplitSeq(pathValue, string(os.PathListSeparator)) {
		if entry == "" || seen[entry] {
			continue
		}
		seen[entry] = true
		parts = append(parts, entry)
	}
	for _, entry := range extraPaths {
		if entry == "" || seen[entry] {
			continue
		}
		seen[entry] = true
		parts = append(parts, entry)
	}

	nextPath := strings.Join(parts, string(os.PathListSeparator))
	// NO_COLOR can belong to the process that launched Axon rather than the
	// user's interactive shell. Letting that host-only flag leak into every PTY
	// makes Codex, Claude, Git, test runners, and other capable tools silently
	// flatten their output even though Axon provides a truecolor terminal. I
	// remove it for the interactive PTY and advertise the standard color hints
	// below. I deliberately do not set FORCE_COLOR because commands that are
	// writing machine-readable output must still be allowed to disable styling.
	env = removeEnvironmentValue(env, "NO_COLOR")
	// The PTY host needs these values to authenticate Electron and monitor its
	// owner, but commands launched inside the terminal are outside that trust
	// boundary. Removing the private service identity prevents `npm run dev` or
	// a nested packaged Axon launched from this shell from reusing, unlinking, or
	// impersonating the host that owns the current terminal session.
	for _, privateKey := range []string{
		"AXON_CORE_PORT",
		"AXON_CORE_TOKEN",
		"AXON_PTY_CONTROL",
		"AXON_PTY_LOG_PATH",
		"AXON_PTY_OWNER_STDIN",
		"AXON_PTY_PORT",
		"AXON_PTY_TOKEN",
	} {
		env = removeEnvironmentValue(env, privateKey)
	}
	env = upsertEnvironmentValue(env, "PATH", nextPath)
	env = upsertEnvironmentValue(env, "TERM", "xterm-256color")
	env = upsertEnvironmentValue(env, "COLORTERM", "truecolor")
	env = upsertEnvironmentValue(env, "CLICOLOR", "1")
	env = upsertEnvironmentValue(env, "TERM_PROGRAM", "Axon")
	env = upsertEnvironmentValue(env, "AXON_TERM", "true")

	return env
}

func upsertEnvironmentValue(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}

	return append(env, prefix+value)
}

func removeEnvironmentValue(env []string, key string) []string {
	prefix := key + "="
	filtered := env[:0]
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			continue
		}
		filtered = append(filtered, entry)
	}
	return filtered
}
