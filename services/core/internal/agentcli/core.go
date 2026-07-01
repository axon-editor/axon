package agentcli

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// resolveCorePort reads the port published by the running axon-core process.
// The fallback keeps local development simple: if the port file is missing
// because core has not started yet, the CLI still uses the same default port
// the renderer and README already document.
func resolveCorePort() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "7777"
	}
	data, err := os.ReadFile(filepath.Join(home, ".axon", "core.port"))
	if err != nil {
		return "7777"
	}
	port := strings.TrimSpace(string(data))
	if port == "" {
		return "7777"
	}
	return port
}

// coreRunning checks the health endpoint with a short timeout.
// This command runs in a terminal, so a dead or stale port file should fail
// quickly instead of making the shell feel frozen before we even try to start
// the bundled backend.
func coreRunning(ctx context.Context, port string) bool {
	checkContext, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()

	request, err := http.NewRequestWithContext(checkContext, http.MethodGet, coreURL(port, "/health"), nil)
	if err != nil {
		return false
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusOK
}

// ensureCore is the bridge between terminal usage and the desktop backend.
// If Axon is already open, the CLI reuses that running core process. If it is
// not open, we try to start a packaged or development axon-core binary and wait
// briefly for /health so the user can run `axon-agent ask` without manually
// booting the app first.
func ensureCore(ctx context.Context, port string) error {
	if coreRunning(ctx, port) {
		return nil
	}
	if err := startCore(port); err != nil {
		return err
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if coreRunning(ctx, port) {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return errCoreUnavailable
}

// startCore walks the known install locations instead of doing port discovery.
// The CLI is not the owner of the backend lifecycle; it only needs a best-effort
// bootstrap path for terminal commands. Each candidate is skipped silently so
// one stale install does not block the next valid location.
func startCore(port string) error {
	for _, candidate := range axonCoreCandidates() {
		resolved, ok := resolveExecutableCandidate(candidate)
		if !ok {
			continue
		}
		command := exec.Command(resolved)
		command.Env = append(os.Environ(), "AXON_CORE_PORT="+port)
		if err := command.Start(); err != nil {
			continue
		}
		// The CLI starts axon-core as a background companion and then talks to
		// it over HTTP. Releasing the process handle avoids leaving the terminal
		// command responsible for waiting on a long-lived server it does not own.
		_ = command.Process.Release()
		return nil
	}
	return errCoreUnavailable
}

// axonCoreCandidates returns the paths that can host the backend binary.
// The sibling lookup comes first because packaged builds copy the axon CLI and
// axon-core into the same resources folder. That keeps a released CLI paired
// with the exact backend version it shipped with before falling back to system
// installs, development outputs, or PATH.
func axonCoreCandidates() []string {
	candidates := []string{}
	if executablePath, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(executablePath), executableName("axon-core")))

		// `axon` is normally installed into /usr/local/bin as a symlink to the
		// bundled CLI binary. os.Executable can report the symlink path, which
		// would make the sibling lookup search /usr/local/bin/axon-core instead
		// of the real release resources folder. Resolving the symlink keeps the
		// CLI paired with the axon-core binary it was built beside.
		if realPath, err := filepath.EvalSymlinks(executablePath); err == nil {
			candidates = append(candidates, filepath.Join(filepath.Dir(realPath), executableName("axon-core")))
		}
	}

	return append(candidates,
		"/Applications/Axon.app/Contents/Resources/core/"+executableName("axon-core"),
		"/usr/lib/axon/"+executableName("axon-core"),
		filepath.Join(".", "editor", "build", "core", executableName("axon-core")),
		filepath.Join(".", "core", executableName("axon-core")),
		filepath.Join(".", executableName("axon-core")),
		executableName("axon-core"),
	)
}

// executableName centralizes the Windows suffix so every candidate path uses
// the same binary name. Without this, Windows builds would compile the agent
// correctly but fail to find axon-core when launched outside the desktop app.
func executableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

// resolveExecutableCandidate handles both absolute/development paths and PATH
// lookups. Treating them separately avoids calling LookPath on paths that are
// meant to be checked exactly, which would make a missing packaged binary look
// like a different global binary by accident.
func resolveExecutableCandidate(candidate string) (string, bool) {
	if strings.Contains(candidate, string(os.PathSeparator)) {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, true
		}
		return "", false
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", false
	}
	return resolved, true
}

// coreURL keeps local API construction in one place so commands do not drift
// between slightly different localhost strings or path joins.
func coreURL(port string, path string) string {
	return "http://127.0.0.1:" + port + path
}
