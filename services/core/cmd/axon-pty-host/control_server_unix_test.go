//go:build !windows

package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/ptyhost"
)

func requestUnixSocket(socketPath string, authToken string) (string, error) {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
		},
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 150 * time.Millisecond}
	request, err := http.NewRequest(http.MethodGet, "http://axon.local/health", nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+authToken)
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	return string(body), err
}

func TestControlTransportReclaimsReplacedSocketPath(t *testing.T) {
	const authToken = "control-recovery-test-token"
	// macOS limits Unix socket paths to roughly one hundred bytes, while
	// testing.T.TempDir includes the full test name. A deliberately short temp
	// root keeps this regression focused on ownership recovery instead of
	// failing at bind time because the fixture pathname itself is too long.
	tempDirectory, err := os.MkdirTemp("/tmp", "axon-pty-")
	if err != nil {
		t.Fatalf("create short socket directory: %v", err)
	}
	defer os.RemoveAll(tempDirectory)
	controlPath := filepath.Join(tempDirectory, "control.sock")
	listener, cleanup, err := listenControl(controlPath)
	if err != nil {
		t.Fatalf("listen on control path: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	serveDone := make(chan error, 1)
	go func() {
		serveDone <- serveControlTransport(
			ctx,
			ptyhost.New(authToken).ControlRouter(),
			controlPath,
			authToken,
			listener,
			cleanup,
			10*time.Millisecond,
		)
	}()

	if body, err := requestUnixSocket(controlPath, authToken); err != nil || !strings.Contains(body, "Axon PTY host running") {
		cancel()
		t.Fatalf("initial control request failed: body=%q err=%v", body, err)
	}

	if err := os.Remove(controlPath); err != nil {
		cancel()
		t.Fatalf("unlink original control path: %v", err)
	}
	intruder, err := net.Listen("unix", controlPath)
	if err != nil {
		cancel()
		t.Fatalf("replace control path: %v", err)
	}
	defer intruder.Close()

	deadline := time.Now().Add(3 * time.Second)
	for {
		body, requestErr := requestUnixSocket(controlPath, authToken)
		if requestErr == nil && strings.Contains(body, "Axon PTY host running") {
			break
		}
		if time.Now().After(deadline) {
			cancel()
			t.Fatalf("control path was not reclaimed: body=%q err=%v", body, requestErr)
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	select {
	case err := <-serveDone:
		if err != nil {
			t.Fatalf("control server stopped with an error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("control server did not stop after cancellation")
	}
}
