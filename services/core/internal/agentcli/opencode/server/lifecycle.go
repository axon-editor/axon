// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	startAttempts = 80
	startPoll     = 200 * time.Millisecond
	stopTimeout   = 2 * time.Second
	logLimit      = 8 * 1024
)

// OpenCode is configured to ask before every mutating tool. The CLI bridges
// those requests to its own approval UI instead of letting the provider run
// commands behind the user's back.
const managedConfig = `{"permission":{"bash":"ask","edit":"ask","webfetch":"ask"}}`

// Handle is one managed OpenCode child. The CLI never attaches to a user's
// existing OpenCode service because that service may run tools without an
// approval round trip, which would bypass the terminal's approval UI.
type Handle struct {
	BaseURL    string
	FolderPath string
	Password   string

	command *exec.Cmd
	done    chan struct{}
	mu      sync.Mutex
	logs    []string
}

// Authorization is Basic auth with the managed password. The username is fixed
// because OpenCode ignores it and only checks the password half.
func (h *Handle) Authorization() string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("opencode:"+h.Password))
}

// Logs is only read when startup fails. Returning a snapshot keeps the handle
// mutex out of the error path that is already reporting a broken process.
func (h *Handle) Logs() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return strings.Join(h.logs, "")
}

// alive reads the done channel instead of ProcessState because exec.Cmd only
// fills ProcessState after Wait returns. A dedicated goroutine closes done, so
// callers can check liveness without racing the process reaper.
func (h *Handle) alive() bool {
	select {
	case <-h.done:
		return false
	default:
		return true
	}
}

// appendLog keeps startup failures readable without letting a chatty server
// grow memory for the whole session.
func (h *Handle) appendLog(chunk []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.logs = append(h.logs, string(chunk))
	size := 0
	for _, entry := range h.logs {
		size += len(entry)
	}
	for size > logLimit && len(h.logs) > 1 {
		size -= len(h.logs[0])
		h.logs = h.logs[1:]
	}
}

var (
	serverMu       sync.Mutex
	current        *Handle
	startingHandle *Handle
	pending        chan struct{}
)

// Ensure starts one managed OpenCode server per workspace. A second caller
// waits for the first start instead of racing a duplicate listener or leaking
// an unowned process.
func Ensure(ctx context.Context, folder string) (*Handle, error) {
	for {
		serverMu.Lock()
		if current != nil && current.FolderPath == folder && current.alive() {
			handle := current
			serverMu.Unlock()
			return handle, nil
		}
		if pending != nil {
			wait := pending
			serverMu.Unlock()
			select {
			case <-wait:
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		wait := make(chan struct{})
		pending = wait
		serverMu.Unlock()

		handle, err := start(folder)

		serverMu.Lock()
		if err == nil {
			current = handle
		}
		pending = nil
		close(wait)
		serverMu.Unlock()
		return handle, err
	}
}

// start owns the child lifecycle. The permission config is intentionally not
// configurable: the CLI's approval bridge only knows how to answer the tool
// classes the managed config asks about, so auto-approving anything else would
// execute workspace changes with no visible prompt.
func start(folder string) (*Handle, error) {
	binary, err := Detect()
	if err != nil {
		return nil, err
	}
	port, err := freePort()
	if err != nil {
		return nil, err
	}
	password, err := randomPassword()
	if err != nil {
		return nil, err
	}
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	command := exec.Command(binary.Path, "serve", "--hostname", "127.0.0.1", "--port", fmt.Sprint(port))
	command.Dir = folder
	command.Env = append(os.Environ(),
		"OPENCODE_SERVER_PASSWORD="+password,
		"OPENCODE_CONFIG_CONTENT="+managedConfig,
	)
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := command.Start(); err != nil {
		return nil, err
	}

	handle := &Handle{
		BaseURL:    baseURL,
		FolderPath: folder,
		Password:   password,
		command:    command,
		done:       make(chan struct{}),
	}
	// Register the child before the readiness poll so a SIGTERM during startup
	// can stop it. Without this, exiting in the poll window leaves the server
	// parented to launchd with no owner.
	serverMu.Lock()
	startingHandle = handle
	serverMu.Unlock()
	defer func() {
		serverMu.Lock()
		if startingHandle == handle {
			startingHandle = nil
		}
		serverMu.Unlock()
	}()
	go func() {
		_ = command.Wait()
		close(handle.done)
	}()
	go drain(handle, stdout)
	go drain(handle, stderr)

	client := &http.Client{Timeout: 800 * time.Millisecond}
	authorization := handle.Authorization()
	for attempt := 0; attempt < startAttempts; attempt++ {
		if !handle.alive() {
			return nil, fmt.Errorf("OpenCode server exited during startup.\n%s", handle.Logs())
		}
		request, err := http.NewRequest(http.MethodGet, baseURL+"/api/info", nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("Authorization", authorization)
		response, err := client.Do(request)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode >= 200 && response.StatusCode < 300 {
				return handle, nil
			}
		}
		time.Sleep(startPoll)
	}

	_ = stopHandle(handle)
	return nil, fmt.Errorf("OpenCode server did not start.\n%s", handle.Logs())
}

func drain(handle *Handle, reader io.Reader) {
	buffer := make([]byte, 4096)
	for {
		size, err := reader.Read(buffer)
		if size > 0 {
			handle.appendLog(buffer[:size])
		}
		if err != nil {
			return
		}
	}
}

// freePort reserves a port just long enough to learn its number. The listener
// is closed before the child starts, which leaves a small race window but keeps
// the CLI from guessing a port that the OS already assigned to something else.
func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return 0, errors.New("could not allocate an OpenCode server port")
	}
	return address.Port, nil
}

// randomPassword gives every managed server its own credential so a stale or
// shared process on a nearby port cannot answer the CLI's requests.
func randomPassword() (string, error) {
	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

// Stop terminates the managed server. The CLI calls it when the TUI exits so
// a terminal session does not leave an unowned process holding a port.
func Stop() error {
	serverMu.Lock()
	handle := current
	current = nil
	pendingHandle := startingHandle
	startingHandle = nil
	serverMu.Unlock()

	if handle != nil {
		if err := stopHandle(handle); err != nil {
			return err
		}
	}
	if pendingHandle != nil {
		return stopHandle(pendingHandle)
	}
	return nil
}

// stopHandle asks for a graceful exit first because OpenCode owns child
// processes such as language servers. Killing the parent immediately can leave
// those children orphaned; the hard kill is only the deadline fallback.
func stopHandle(handle *Handle) error {
	if !handle.alive() || handle.command.Process == nil {
		return nil
	}
	_ = handle.command.Process.Signal(syscall.SIGTERM)
	select {
	case <-handle.done:
		return nil
	case <-time.After(stopTimeout):
		if err := handle.command.Process.Kill(); err != nil {
			return err
		}
		select {
		case <-handle.done:
			return nil
		case <-time.After(stopTimeout):
			return errors.New("OpenCode server did not stop")
		}
	}
}
