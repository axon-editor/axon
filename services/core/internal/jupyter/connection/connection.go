// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

// Package connection models the Jupyter connection file a kernel reads with -f.
// The file is the only contract between this host and ipykernel: it pins the five
// ZMQ ports, the transport, and the HMAC key. I keep it a pure data type with no
// process knowledge so the launcher and the client can both depend on it without
// pulling in the other.
package connection

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
)

// File is the on-disk Jupyter connection document. Field names and JSON tags
// must match Jupyter exactly because ipykernel parses this file verbatim.
type File struct {
	ShellPort   int    `json:"shell_port"`
	IOPubPort   int    `json:"iopub_port"`
	StdinPort   int    `json:"stdin_port"`
	ControlPort int    `json:"control_port"`
	HBPort      int    `json:"hb_port"`
	IP          string `json:"ip"`
	Key         string `json:"key"`
	Transport   string `json:"transport"`
	SigScheme   string `json:"signature_scheme"`
	KernelName  string `json:"kernel_name"`
}

const (
	// TransportTCP is the only transport this host supports. IPC transport would
	// avoid the loopback TCP encryption warning ipykernel prints, but it ties the
	// connection file to local filesystem paths that differ per platform, and the
	// sockets are already bound to loopback behind a per-launch bearer token.
	TransportTCP = "tcp"
	// SignatureSchemeHMACSHA256 is the Jupyter default and the only scheme the
	// wire codec implements. If ipykernel ever negotiates a different one the
	// signature check would fail closed rather than silently skip verification.
	SignatureSchemeHMACSHA256 = "hmac-sha256"
)

// AllocatePorts reserves five distinct loopback ports by binding and immediately
// releasing them. There is a small race between release and ipykernel's own bind,
// but the window is tiny and a lost race only fails that one launch, which the
// user can retry; the alternative of asking the kernel to pick ports is not part
// of the -f handshake.
func AllocatePorts(count int) ([]int, error) {
	ports := make([]int, 0, count)
	listeners := make([]net.Listener, 0, count)
	defer func() {
		for _, listener := range listeners {
			_ = listener.Close()
		}
	}()

	seen := map[int]bool{}
	for len(ports) < count {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return nil, err
		}
		port := listener.Addr().(*net.TCPAddr).Port
		if seen[port] {
			_ = listener.Close()
			continue
		}
		seen[port] = true
		ports = append(ports, port)
		listeners = append(listeners, listener)
	}
	return ports, nil
}

// New builds a connection file bound to loopback with a fresh random key. The key
// is a hex string rather than raw bytes: Jupyter treats the JSON string as the
// HMAC key material, so storing anything else would make the kernel and this host
// disagree on the signing key.
func New(kernelName string) (File, error) {
	ports, err := AllocatePorts(5)
	if err != nil {
		return File{}, err
	}
	rawKey := make([]byte, 32)
	if _, err := rand.Read(rawKey); err != nil {
		return File{}, err
	}
	return File{
		ShellPort:   ports[0],
		IOPubPort:   ports[1],
		StdinPort:   ports[2],
		ControlPort: ports[3],
		HBPort:      ports[4],
		IP:          "127.0.0.1",
		Key:         hex.EncodeToString(rawKey),
		Transport:   TransportTCP,
		SigScheme:   SignatureSchemeHMACSHA256,
		KernelName:  kernelName,
	}, nil
}

// Write persists the connection file owner-only. ipykernel refuses to start if the
// file is world readable because the key grants full kernel control, so the mode
// is not cosmetic.
func (f File) Write(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	payload, err := json.Marshal(f)
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0600)
}

// Load parses a connection file. It is used by tests and by any future path that
// connects to an already-running kernel instead of spawning one.
func Load(path string) (File, error) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return File{}, err
	}
	var file File
	if err := json.Unmarshal(payload, &file); err != nil {
		return File{}, err
	}
	if file.Transport == "" {
		file.Transport = TransportTCP
	}
	if file.SigScheme == "" {
		file.SigScheme = SignatureSchemeHMACSHA256
	}
	return file, nil
}

// SigningKey returns the HMAC key bytes. Jupyter keys on the UTF-8 bytes of the
// JSON string, so callers must not hex-decode or otherwise transform the key.
func (f File) SigningKey() []byte {
	return []byte(f.Key)
}

// Endpoint renders a ZMQ endpoint for one of the kernel's ports.
func (f File) Endpoint(port int) string {
	transport := f.Transport
	if transport == "" {
		transport = TransportTCP
	}
	if transport == "ipc" {
		return fmt.Sprintf("ipc://%s-%d", strings.TrimSpace(f.IP), port)
	}
	host := strings.TrimSpace(f.IP)
	if host == "" {
		host = "127.0.0.1"
	}
	return fmt.Sprintf("tcp://%s:%d", host, port)
}
