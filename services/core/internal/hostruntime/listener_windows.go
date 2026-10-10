// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build windows

package hostruntime

import (
	"net"

	"github.com/Microsoft/go-winio"
)

// ListenControl binds a named pipe for the private control channel. Owner-only
// access mirrors the 0600 Unix socket; the launch token is still required at the
// HTTP layer as defense in depth, but another Windows account should not be able
// to open the pipe at all.
func ListenControl(path string) (net.Listener, func(), error) {
	listener, err := winio.ListenPipe(path, &winio.PipeConfig{
		SecurityDescriptor: "D:P(A;;GA;;;OW)",
		InputBufferSize:    64 << 10,
		OutputBufferSize:   64 << 10,
	})
	if err != nil {
		return nil, nil, err
	}
	return listener, func() { _ = listener.Close() }, nil
}
