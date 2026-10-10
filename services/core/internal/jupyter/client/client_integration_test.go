// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/jupyter/connection"
	"github.com/GordenArcher/axon-core/internal/jupyter/wire"
)

// TestLiveKernelInterop proves go-zeromq interoperates with a real ipykernel.
//
// This is the check that matters most for the Go client: unlike an HTTP peer, the
// kernel speaks ZMTP, and we rely on a pure-Go implementation of it rather than
// libzmq. If the handshake or framing ever drifts, everything above this layer
// breaks in ways unit tests on synthetic frames cannot catch. The test is skipped
// unless a python interpreter with ipykernel is supplied, because the build hosts
// do not guarantee one.
//
//	AXON_JUPYTER_TEST_PYTHON=/path/to/venv/bin/python go test ./internal/jupyter/client
func TestLiveKernelInterop(t *testing.T) {
	python := strings.TrimSpace(os.Getenv("AXON_JUPYTER_TEST_PYTHON"))
	if python == "" {
		t.Skip("set AXON_JUPYTER_TEST_PYTHON to a python with ipykernel installed")
	}

	workDir := t.TempDir()
	conn, err := connection.New("python3")
	if err != nil {
		t.Fatalf("build connection file: %v", err)
	}
	connPath := filepath.Join(workDir, "connection.json")
	if err := conn.Write(connPath); err != nil {
		t.Fatalf("write connection file: %v", err)
	}

	var stderr bytes.Buffer
	command := exec.Command(python, "-m", "ipykernel_launcher", "-f", connPath)
	command.Dir = workDir
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		t.Fatalf("start kernel: %v", err)
	}
	defer func() {
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		_ = command.Wait()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	kernel := dialUntilReady(ctx, t, conn, &stderr)
	defer kernel.Close()

	var mu sync.Mutex
	streamed := strings.Builder{}
	results := map[string]bool{}
	kernel.SetIOPubHandler(func(message wire.Message) {
		mu.Lock()
		defer mu.Unlock()
		parentID := wire.ParentMsgID(message.ParentHeader)
		switch message.Header.MsgType {
		case wire.MsgStream:
			var content struct {
				Text string `json:"text"`
			}
			_ = json.Unmarshal(message.Content, &content)
			streamed.WriteString(content.Text)
		case wire.MsgExecuteResult:
			results[parentID] = true
		}
	})

	pending, err := kernel.Execute(ctx, "print('hello from kernel'); 6 * 7", "")
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	reply, err := pending.Wait(ctx)
	if err != nil {
		t.Fatalf("wait execute_reply: %v", err)
	}
	var replyContent struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(reply.Content, &replyContent); err != nil {
		t.Fatalf("decode execute_reply: %v", err)
	}
	if replyContent.Status != "ok" {
		t.Fatalf("execute_reply status = %q; kernel stderr:\n%s", replyContent.Status, stderr.String())
	}

	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(streamed.String(), "hello from kernel") {
		t.Fatalf("stdout stream missing text: %q", streamed.String())
	}
	if !results[pending.MsgID] {
		t.Fatalf("execute_result missing for %s", pending.MsgID)
	}
}

// dialUntilReady retries Dial plus the kernel_info handshake while ipykernel is
// still binding its sockets. ZMQ connection setup races the child process start,
// so a single attempt is flaky on a cold test machine.
func dialUntilReady(ctx context.Context, t *testing.T, conn connection.File, stderr *bytes.Buffer) *Client {
	t.Helper()
	var lastErr error
	for attempt := 0; attempt < 50; attempt++ {
		if ctx.Err() != nil {
			break
		}
		kernel, err := Dial(ctx, conn)
		if err != nil {
			lastErr = err
			time.Sleep(100 * time.Millisecond)
			continue
		}
		infoCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		info, err := kernel.KernelInfo(infoCtx)
		cancel()
		if err == nil {
			if info == nil {
				lastErr = nil
			}
			return kernel
		}
		lastErr = err
		kernel.Close()
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("kernel never became ready: %v; stderr:\n%s", lastErr, stderr.String())
	return nil
}
