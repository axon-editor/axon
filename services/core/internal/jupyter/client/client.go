// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

// Package client speaks the Jupyter kernel protocol over ZMQ. It owns the five
// sockets a kernel opens (shell, iopub, stdin, control, heartbeat), signs and
// verifies every message, and correlates replies with the request that caused
// them. The host above it only sees decoded wire messages.
//
// I use go-zeromq rather than a cgo binding so the core keeps building CGO-free
// and cross-compiles. That means the ZMTP handshake belongs to this library, not
// to libzmq, which is why a live-kernel interop test matters more here than in
// code that talks to ordinary HTTP peers.
package client

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/jupyter/connection"
	"github.com/GordenArcher/axon-core/internal/jupyter/wire"
	"github.com/go-zeromq/zmq4"
)

// ErrClosed is returned when a request is attempted after Close.
var ErrClosed = errors.New("jupyter client is closed")

// Pending is a dispatched request awaiting its reply on the same channel. The
// reply carries the request's msg_id as its parent, which is how Jupyter channels
// correlate concurrent work.
type Pending struct {
	MsgID string
	ch    chan wire.Message
}

// Wait blocks for the reply or the context, whichever comes first.
func (p *Pending) Wait(ctx context.Context) (wire.Message, error) {
	select {
	case <-ctx.Done():
		return wire.Message{}, ctx.Err()
	case message := <-p.ch:
		return message, nil
	}
}

// Client is a connected Jupyter kernel. It is safe for concurrent use; each
// socket has a single reader goroutine and sends are serialized per socket.
type Client struct {
	conn    connection.File
	codec   wire.Codec
	session string

	shell   zmq4.Socket
	control zmq4.Socket
	iopub   zmq4.Socket
	stdin   zmq4.Socket
	hb      zmq4.Socket

	shellSendMu   sync.Mutex
	controlSendMu sync.Mutex

	waiterMu sync.Mutex
	waiters  map[string]*Pending

	iopubHandlerMu sync.Mutex
	iopubHandler   func(wire.Message)

	closeOnce sync.Once
	closed    chan struct{}
}

// Dial connects every socket a kernel exposes. iopub is subscribed to all topics
// because this host is the sole consumer of the kernel's output stream.
func Dial(ctx context.Context, conn connection.File) (*Client, error) {
	client := &Client{
		conn:    conn,
		codec:   wire.NewCodec(conn.Key),
		session: newID(),
		waiters: map[string]*Pending{},
		closed:  make(chan struct{}),
	}

	client.shell = zmq4.NewDealer(ctx)
	if err := client.shell.Dial(conn.Endpoint(conn.ShellPort)); err != nil {
		return nil, fmt.Errorf("dial shell: %w", err)
	}
	client.control = zmq4.NewDealer(ctx)
	if err := client.control.Dial(conn.Endpoint(conn.ControlPort)); err != nil {
		return nil, fmt.Errorf("dial control: %w", err)
	}
	client.stdin = zmq4.NewDealer(ctx)
	if err := client.stdin.Dial(conn.Endpoint(conn.StdinPort)); err != nil {
		return nil, fmt.Errorf("dial stdin: %w", err)
	}
	client.iopub = zmq4.NewSub(ctx)
	if err := client.iopub.Dial(conn.Endpoint(conn.IOPubPort)); err != nil {
		return nil, fmt.Errorf("dial iopub: %w", err)
	}
	if err := client.iopub.SetOption(zmq4.OptionSubscribe, ""); err != nil {
		return nil, fmt.Errorf("subscribe iopub: %w", err)
	}
	client.hb = zmq4.NewReq(ctx)
	if err := client.hb.Dial(conn.Endpoint(conn.HBPort)); err != nil {
		return nil, fmt.Errorf("dial heartbeat: %w", err)
	}

	go client.readLoop(client.shell, client.deliverReply)
	go client.readLoop(client.control, client.deliverReply)
	go client.readLoop(client.iopub, client.deliverIOPub)
	go client.readLoop(client.stdin, func(wire.Message) {
		// allow_stdin is always false for notebook execution, so a stdin request
		// should never arrive. Draining it anyway stops the kernel from blocking on
		// a reply that will never come if a cell misbehaves.
	})
	go client.heartbeatLoop(ctx)

	return client, nil
}

func newID() string {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		// A duplicate id from a failed RNG read would only confuse correlation, and
		// there is no recovery here, so fall back to a time-based value.
		return fmt.Sprintf("axon-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(raw)
}

func (c *Client) readLoop(socket zmq4.Socket, handle func(wire.Message)) {
	for {
		msg, err := socket.Recv()
		if err != nil {
			select {
			case <-c.closed:
				return
			default:
			}
			log.Printf("jupyter %T receive failed: %v", socket, err)
			return
		}
		decoded, err := c.codec.Decode(msg.Frames)
		if err != nil {
			log.Printf("jupyter dropped undecodable message: %v", err)
			continue
		}
		handle(decoded)
	}
}

func (c *Client) deliverReply(message wire.Message) {
	parentID := wire.ParentMsgID(message.ParentHeader)
	c.waiterMu.Lock()
	pending := c.waiters[parentID]
	if pending != nil {
		delete(c.waiters, parentID)
	}
	c.waiterMu.Unlock()
	if pending == nil {
		return
	}
	select {
	case pending.ch <- message:
	case <-c.closed:
	}
}

func (c *Client) deliverIOPub(message wire.Message) {
	c.iopubHandlerMu.Lock()
	handler := c.iopubHandler
	c.iopubHandlerMu.Unlock()
	if handler != nil {
		handler(message)
	}
}

// SetIOPubHandler registers the sink for asynchronous kernel output. It is set
// once before execution starts; the single writer is the ipyub reader goroutine.
func (c *Client) SetIOPubHandler(handler func(wire.Message)) {
	c.iopubHandlerMu.Lock()
	c.iopubHandler = handler
	c.iopubHandlerMu.Unlock()
}

func (c *Client) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.closed:
			return
		case <-ticker.C:
			if err := c.hb.Send(zmq4.NewMsg([]byte("ping"))); err != nil {
				return
			}
			if _, err := c.hb.Recv(); err != nil {
				return
			}
		}
	}
}

// Dispatch sends a request on the named channel and returns a Pending that
// resolves when the matching reply arrives. channel is "shell" or "control".
//
// A caller may supply msgID so it can correlate the asynchronous iopub output
// before the request leaves this process; a kernel can emit a status message
// almost immediately, so registering the mapping after Dispatch returns would be
// a race. An empty msgID is generated here for callers that do not stream.
func (c *Client) Dispatch(ctx context.Context, channel string, msgType string, content map[string]any, msgID string) (*Pending, error) {
	select {
	case <-c.closed:
		return nil, ErrClosed
	default:
	}

	if msgID == "" {
		msgID = newID()
	}
	pending := &Pending{MsgID: msgID, ch: make(chan wire.Message, 1)}
	c.waiterMu.Lock()
	c.waiters[msgID] = pending
	c.waiterMu.Unlock()

	frames, err := c.encode(msgID, msgType, content)
	if err != nil {
		c.forget(msgID)
		return nil, err
	}

	switch channel {
	case "control":
		c.controlSendMu.Lock()
		err = c.control.Send(zmq4.NewMsgFrom(frames...))
		c.controlSendMu.Unlock()
	default:
		c.shellSendMu.Lock()
		err = c.shell.Send(zmq4.NewMsgFrom(frames...))
		c.shellSendMu.Unlock()
	}
	if err != nil {
		c.forget(msgID)
		return nil, fmt.Errorf("send %s: %w", msgType, err)
	}
	return pending, nil
}

// Request is Dispatch plus Wait for callers that do not stream output.
func (c *Client) Request(ctx context.Context, channel string, msgType string, content map[string]any) (wire.Message, error) {
	pending, err := c.Dispatch(ctx, channel, msgType, content, "")
	if err != nil {
		return wire.Message{}, err
	}
	return pending.Wait(ctx)
}

func (c *Client) encode(msgID string, msgType string, content map[string]any) ([][]byte, error) {
	rawContent, err := json.Marshal(content)
	if err != nil {
		return nil, err
	}
	return c.codec.Encode(wire.Message{
		Header: wire.Header{
			MsgID:    msgID,
			Username: "axon",
			Session:  c.session,
			Date:     time.Now().UTC(),
			MsgType:  msgType,
			Version:  wire.ProtocolVersion,
		},
		Content: rawContent,
	})
}

func (c *Client) forget(msgID string) {
	c.waiterMu.Lock()
	delete(c.waiters, msgID)
	c.waiterMu.Unlock()
}

// KernelInfo performs the startup handshake and returns the reply content, which
// carries the language and banner the UI shows before the first execution.
func (c *Client) KernelInfo(ctx context.Context) (map[string]any, error) {
	reply, err := c.Request(ctx, "shell", wire.MsgKernelInfoRequest, map[string]any{})
	if err != nil {
		return nil, err
	}
	return decodeContent(reply.Content), nil
}

// Execute dispatches an execute_request and returns the Pending whose msg_id the
// caller uses to correlate the streamed output and terminal execute_reply. The
// caller supplies msgID, or passes "" to have one generated.
func (c *Client) Execute(ctx context.Context, code string, msgID string) (*Pending, error) {
	return c.Dispatch(ctx, "shell", wire.MsgExecuteRequest, map[string]any{
		"code":             code,
		"silent":           false,
		"store_history":    true,
		"user_expressions": map[string]any{},
		"allow_stdin":      false,
		"stop_on_error":    true,
	}, msgID)
}

// Interrupt requests a cooperative interrupt over the control channel. The host
// also signals the kernel process directly, because a kernel stuck in native code
// never drains its control channel.
func (c *Client) Interrupt(ctx context.Context) error {
	_, err := c.Request(ctx, "control", wire.MsgControlInterruptRequest, map[string]any{})
	return err
}

// Shutdown asks the kernel to exit. The caller still reaps the process because a
// crashed or non-cooperative kernel will not honor the request.
func (c *Client) Shutdown(ctx context.Context, restart bool) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_, err := c.Request(ctx, "control", wire.MsgControlShutdownRequest, map[string]any{"restart": restart})
	return err
}

// Close tears every socket down. It is idempotent.
func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.closed)
		for _, socket := range []zmq4.Socket{c.shell, c.control, c.stdin, c.iopub, c.hb} {
			if socket != nil {
				_ = socket.Close()
			}
		}
	})
}

func decodeContent(raw json.RawMessage) map[string]any {
	content := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &content)
	}
	return content
}
