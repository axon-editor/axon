package main

import (
	"errors"
	"os"
	"testing"
	"time"
)

type failingOwnerReader struct{}

func (failingOwnerReader) Read([]byte) (int, error) {
	return 0, errors.New("owner descriptor became unreadable")
}

func TestMonitorOwnerReportsPipeClosure(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("create owner pipe: %v", err)
	}
	defer reader.Close()

	ownerLost := monitorOwner(reader)
	if err := writer.Close(); err != nil {
		t.Fatalf("close owner pipe: %v", err)
	}

	select {
	case <-ownerLost:
	case <-time.After(time.Second):
		t.Fatal("owner closure did not stop the PTY host monitor")
	}
}

func TestMonitorOwnerStaysAliveWhilePipeIsOpen(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("create owner pipe: %v", err)
	}
	defer reader.Close()
	defer writer.Close()

	ownerLost := monitorOwner(reader)
	select {
	case <-ownerLost:
		t.Fatal("open owner pipe was treated as a dead Electron process")
	case <-time.After(30 * time.Millisecond):
	}
}

func TestMonitorOwnerReportsNonEOFReadFailure(t *testing.T) {
	ownerLost := monitorOwner(failingOwnerReader{})

	select {
	case <-ownerLost:
	case <-time.After(time.Second):
		t.Fatal("owner read failure did not stop the PTY host monitor")
	}
}
