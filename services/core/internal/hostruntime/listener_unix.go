// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build !windows

package hostruntime

import (
	"net"
	"os"
	"path/filepath"
)

// ListenControl binds the private Unix socket the Electron main process talks to
// for health, capability tickets, and other low-volume control traffic. The socket
// is 0600 in an owner-only directory so another local account cannot connect even
// if it learns the path.
func ListenControl(path string) (net.Listener, func(), error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, nil, err
	}
	_ = os.Remove(path)
	listener, err := net.Listen("unix", path)
	if err != nil {
		return nil, nil, err
	}
	if err := os.Chmod(path, 0600); err != nil {
		_ = listener.Close()
		_ = os.Remove(path)
		return nil, nil, err
	}
	return listener, func() {
		_ = listener.Close()
		_ = os.Remove(path)
	}, nil
}
