//go:build windows

package main

import (
	"net"

	"github.com/Microsoft/go-winio"
)

func listenControl(path string) (net.Listener, func(), error) {
	listener, err := winio.ListenPipe(path, &winio.PipeConfig{
		// Owner-only access mirrors the 0600 Unix socket. The launch token remains
		// required at HTTP level as defense in depth, but another Windows account
		// should not be able to open Axon's local terminal control channel at all.
		SecurityDescriptor: "D:P(A;;GA;;;OW)",
		InputBufferSize:    64 << 10,
		OutputBufferSize:   64 << 10,
	})
	if err != nil {
		return nil, nil, err
	}
	return listener, func() { _ = listener.Close() }, nil
}
