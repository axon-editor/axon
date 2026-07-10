package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/server"
	"github.com/GordenArcher/godenv"
)

func main() {
	fmt.Println("Axon core starting...")

	// I only load .env when the file exists because packaged Axon builds will
	// usually start from the Electron resources directory, where a project
	// .env is not expected. Treating a missing .env as an error would make the
	// bundled desktop app fail before the editor can open, while still letting
	// local development override values through a normal environment file.
	if _, err := os.Stat(".env"); err == nil {
		if err := godenv.Load(".env"); err != nil {
			log.Fatalf("failed to load .env: %v", err)
		}
	}
	port := godenv.Get("AXON_CORE_PORT", "7777")
	authToken := strings.TrimSpace(os.Getenv("AXON_CORE_TOKEN"))
	if authToken == "" {
		var rawToken [32]byte
		if _, err := rand.Read(rawToken[:]); err != nil {
			log.Fatalf("failed to generate core authentication token: %v", err)
		}
		authToken = hex.EncodeToString(rawToken[:])
	}

	s := server.New(authToken)
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		log.Fatalf("failed to bind axon-core to loopback: %v", err)
	}
	actualPort := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)

	// Core owns a shell and the user's workspace files, so "local" must mean the
	// loopback interface, not every network adapter on the machine. I publish the
	// connection state only after the bind succeeds; otherwise a stale port/token
	// pair could make the CLI trust a process that never became Axon Core.
	writeConnectionFiles(actualPort, authToken)
	httpServer := &http.Server{
		Handler:           s.Router(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}
	log.Fatal(httpServer.Serve(listener))
}

func writeConnectionFiles(port string, authToken string) {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}

	// The axon CLI is intentionally a thin terminal companion. It should not
	// scan random ports or guess how the desktop shell configured axon-core, so
	// the running server publishes the selected port in the user's Axon state
	// folder. Failing to write this file must never block editor startup; the
	// CLI still has the stable 7777 fallback for development and recovery cases.
	dir := filepath.Join(home, ".axon")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return
	}
	_ = os.Chmod(dir, 0700)
	_ = os.WriteFile(filepath.Join(dir, "core.port"), []byte(port), 0600)
	_ = os.WriteFile(filepath.Join(dir, "core.token"), []byte(authToken), 0600)
}
