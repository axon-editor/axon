// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package kernelhost

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/jupyter/client"
	"github.com/GordenArcher/axon-core/internal/jupyter/connection"
	"github.com/GordenArcher/axon-core/internal/jupyter/wire"
)

// kernelSpec is everything needed to spawn and label one kernel, resolved from
// the capability ticket so a compromised renderer cannot redirect the launch.
type kernelSpec struct {
	SessionID     string
	Cwd           string
	WorkspaceRoot string
	NotebookPath  string
	Interpreter   string
	KernelName    string
}

// attachment is one renderer view connected to a kernel. The kernel can broadcast
// to several attachments because a reload can briefly overlap the old and new
// sockets, so the implementation must serialize its own writes.
type attachment interface {
	send(payload []byte)
}

// process is one launched ipykernel and the client bound to it. It is replaced
// wholesale on restart so a kernel that never honors shutdown cannot wedge the
// session.
type process struct {
	ctx     context.Context
	cancel  context.CancelFunc
	command *exec.Cmd
	client  *client.Client
	connDir string
}

// Kernel is one notebook session's kernel. The renderer owns when it restarts or
// shuts down; the host only guarantees output correlation and process cleanup.
type Kernel struct {
	spec kernelSpec

	mu       sync.Mutex
	proc     *process
	summary  *kernelSummary
	closed   bool
	lastIdle time.Time

	requestsMu sync.Mutex
	requests   map[string]string // kernel msg_id -> renderer request id

	connsMu sync.Mutex
	conns   map[attachment]bool
}

func newID() string {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return fmt.Sprintf("axon-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(raw)
}

func newKernel(ctx context.Context, spec kernelSpec) (*Kernel, error) {
	kernel := &Kernel{
		spec:     spec,
		requests: map[string]string{},
		conns:    map[attachment]bool{},
	}
	if err := kernel.launch(ctx); err != nil {
		return nil, err
	}
	return kernel, nil
}

// launch spawns ipykernel, dials its sockets, and completes the kernel_info
// handshake. The ready check retries because the child needs a moment to bind its
// ports after exec returns, and ZMQ connection setup races that bind.
func (k *Kernel) launch(parent context.Context) error {
	conn, err := connection.New(k.spec.KernelName)
	if err != nil {
		return err
	}
	connDir, err := os.MkdirTemp("", "axon-kernel-")
	if err != nil {
		return err
	}
	connPath := filepath.Join(connDir, "connection.json")
	if err := conn.Write(connPath); err != nil {
		_ = os.RemoveAll(connDir)
		return err
	}

	ctx, cancel := context.WithCancel(parent)
	command := exec.CommandContext(ctx, specInterpreter(k.spec), "-m", "ipykernel_launcher", "-f", connPath)
	command.Dir = k.spec.Cwd
	command.Stdout = logWriter{prefix: "kernel stdout"}
	command.Stderr = logWriter{prefix: "kernel stderr"}
	if err := command.Start(); err != nil {
		cancel()
		_ = os.RemoveAll(connDir)
		return fmt.Errorf("start ipykernel: %w", err)
	}

	kernelClient, summary, err := connectToKernel(ctx, command, conn)
	if err != nil {
		cancel()
		_ = os.RemoveAll(connDir)
		return err
	}

	kernelClient.SetIOPubHandler(k.handleIOPub)

	launched := &process{ctx: ctx, cancel: cancel, command: command, client: kernelClient, connDir: connDir}
	k.mu.Lock()
	k.proc = launched
	k.summary = summary
	k.lastIdle = time.Now()
	k.mu.Unlock()

	go k.watchExit(launched)
	return nil
}

// connectToKernel retries Dial and the kernel_info handshake while ipykernel is
// still binding. A single attempt is flaky on a cold machine, and a failed dial
// must not be mistaken for a dead kernel.
func connectToKernel(ctx context.Context, command *exec.Cmd, conn connection.File) (*client.Client, *kernelSummary, error) {
	deadline := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return nil, nil, ctx.Err()
		}
		kernelClient, err := client.Dial(ctx, conn)
		if err == nil {
			infoCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			content, infoErr := kernelClient.KernelInfo(infoCtx)
			cancel()
			if infoErr == nil {
				return kernelClient, summarizeKernel(conn.KernelName, content), nil
			}
			err = infoErr
			kernelClient.Close()
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, nil, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
	return nil, nil, fmt.Errorf("kernel did not become ready: %w", lastErr)
}

func specInterpreter(spec kernelSpec) string {
	if spec.Interpreter != "" {
		return spec.Interpreter
	}
	return "python3"
}

// watchExit broadcasts the terminal state when the kernel process ends for any
// reason, so the UI can offer a restart instead of showing a frozen busy state.
func (k *Kernel) watchExit(launched *process) {
	err := launched.command.Wait()
	code := launched.command.ProcessState.ExitCode()

	k.mu.Lock()
	isCurrent := k.proc == launched
	if isCurrent {
		k.proc = nil
	}
	k.mu.Unlock()

	if !isCurrent {
		return
	}
	exitCode := code
	k.broadcast(serverMessage{Type: serverExit, Code: &exitCode})
	if err != nil {
		log.Printf("kernel %s exited: %v", k.spec.SessionID, err)
	}
}

func (k *Kernel) currentProcess() *process {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.proc
}

// handleExecute dispatches an execute_request and streams the result. The kernel
// msg_id is registered before the request is sent because iopub can arrive before
// Execute returns.
func (k *Kernel) handleExecute(attachment attachment, requestID string, code string) {
	proc := k.currentProcess()
	if proc == nil {
		attachment.send(mustMarshal(serverMessage{Type: serverError, ID: requestID, Message: "kernel is not running"}))
		return
	}

	kernelMsgID := newID()
	k.requestsMu.Lock()
	k.requests[kernelMsgID] = requestID
	k.requestsMu.Unlock()

	pending, err := proc.client.Execute(proc.ctx, code, kernelMsgID)
	if err != nil {
		k.forgetRequest(kernelMsgID)
		attachment.send(mustMarshal(serverMessage{Type: serverError, ID: requestID, Message: err.Error()}))
		return
	}

	go func() {
		reply, err := pending.Wait(proc.ctx)
		k.forgetRequest(kernelMsgID)
		if err != nil {
			attachment.send(mustMarshal(serverMessage{Type: serverError, ID: requestID, Message: err.Error()}))
			return
		}
		k.broadcast(serverMessage{Type: serverReply, ID: requestID, Content: reply.Content})
	}()
}

// handleIOPub tags each asynchronous kernel message with the renderer request it
// belongs to. Messages with no parent, such as the startup banner, are dropped
// because the UI only renders output for a cell it asked to run.
func (k *Kernel) handleIOPub(message wire.Message) {
	parentID := wire.ParentMsgID(message.ParentHeader)
	k.requestsMu.Lock()
	requestID := k.requests[parentID]
	k.requestsMu.Unlock()
	if requestID == "" {
		return
	}
	k.broadcast(serverMessage{
		Type:     serverIOPub,
		ID:       requestID,
		MsgType:  message.Header.MsgType,
		Content:  message.Content,
		Metadata: message.Metadata,
	})
}

func (k *Kernel) forgetRequest(kernelMsgID string) {
	k.requestsMu.Lock()
	delete(k.requests, kernelMsgID)
	k.requestsMu.Unlock()
}

// Interrupt asks the kernel to stop cooperatively and then signals the process on
// POSIX. A kernel stuck in a tight native loop never drains its control channel,
// so the signal is what actually breaks out of many runaways.
func (k *Kernel) Interrupt(ctx context.Context) {
	proc := k.currentProcess()
	if proc == nil {
		return
	}
	interruptCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_ = proc.client.Interrupt(interruptCtx)
	if runtime.GOOS != "windows" && proc.command.Process != nil {
		_ = proc.command.Process.Signal(os.Interrupt)
	}
}

// Restart replaces the running kernel with a fresh process. It is torn down
// before the new one starts so the two never compete for the connection file.
func (k *Kernel) Restart(ctx context.Context) error {
	k.closeProcess()
	if err := k.launch(ctx); err != nil {
		return err
	}
	k.broadcast(serverMessage{Type: serverReady, Kernel: k.kernelSummary()})
	return nil
}

// Shutdown asks the kernel to exit and then tears the process down. A crash or a
// non-cooperative kernel still gets reaped by the process teardown.
func (k *Kernel) Shutdown(ctx context.Context) {
	if proc := k.currentProcess(); proc != nil {
		shutdownCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		_ = proc.client.Shutdown(shutdownCtx, false)
		cancel()
	}
	k.closeProcess()
}

// Close releases the kernel and removes its connection directory. It is safe to
// call after Shutdown or Restart.
func (k *Kernel) Close() {
	k.mu.Lock()
	k.closed = true
	k.mu.Unlock()
	k.closeProcess()
}

func (k *Kernel) closeProcess() {
	k.mu.Lock()
	proc := k.proc
	k.proc = nil
	k.mu.Unlock()
	if proc == nil {
		return
	}
	proc.cancel()
	if proc.command.Process != nil {
		_ = proc.command.Process.Kill()
	}
	proc.client.Close()
	_ = os.RemoveAll(proc.connDir)
}

func (k *Kernel) attach(target attachment) {
	k.connsMu.Lock()
	k.conns[target] = true
	k.connsMu.Unlock()
	if summary := k.kernelSummary(); summary != nil {
		target.send(mustMarshal(serverMessage{Type: serverReady, Kernel: summary}))
	}
}

func (k *Kernel) detach(target attachment) {
	k.connsMu.Lock()
	delete(k.conns, target)
	if len(k.conns) == 0 {
		k.lastIdle = time.Now()
	}
	k.connsMu.Unlock()
}

// idleSince reports whether the kernel has had no attached view since before the
// given cutoff, which the server's reaper uses to reclaim abandoned sessions.
func (k *Kernel) idleSince(cutoff time.Time) bool {
	k.connsMu.Lock()
	defer k.connsMu.Unlock()
	return len(k.conns) == 0 && k.lastIdle.Before(cutoff)
}

func (k *Kernel) kernelSummary() *kernelSummary {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.summary
}

func (k *Kernel) isClosed() bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.closed
}

func (k *Kernel) broadcast(message serverMessage) {
	payload := mustMarshal(message)
	k.connsMu.Lock()
	targets := make([]attachment, 0, len(k.conns))
	for target := range k.conns {
		targets = append(targets, target)
	}
	k.connsMu.Unlock()
	for _, target := range targets {
		target.send(payload)
	}
}

// summarizeKernel pulls the name, language, and banner out of a kernel_info_reply
// so the UI can label the kernel before the first cell runs.
func summarizeKernel(fallbackName string, content map[string]any) *kernelSummary {
	summary := &kernelSummary{Name: fallbackName}
	if language, ok := content["language_info"].(map[string]any); ok {
		if name, ok := language["name"].(string); ok {
			summary.Language = name
		}
	}
	if banner, ok := content["banner"].(string); ok {
		summary.Banner = banner
	}
	if name, ok := content["implementation"].(string); ok && name != "" {
		summary.Name = name
	}
	return summary
}

// logWriter routes kernel stdout and stderr into this host's log with a prefix so
// a crashing kernel is diagnosable without a separate file.
type logWriter struct {
	prefix string
}

func (w logWriter) Write(payload []byte) (int, error) {
	log.Printf("[%s] %s", w.prefix, payload)
	return len(payload), nil
}
