//go:build !windows

package main

import (
	"net"
	"os"
	"path/filepath"
)

func listenControl(path string) (net.Listener, func(), error) {
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
