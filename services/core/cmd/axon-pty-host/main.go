package main

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ptyhost"
)

func main() {
	port := strings.TrimSpace(os.Getenv("AXON_PTY_PORT"))
	if port == "" {
		port = "7778"
	}
	authToken := strings.TrimSpace(os.Getenv("AXON_PTY_TOKEN"))
	if authToken == "" {
		var rawToken [32]byte
		if _, err := rand.Read(rawToken[:]); err != nil {
			log.Fatalf("failed to generate PTY host authentication token: %v", err)
		}
		authToken = hex.EncodeToString(rawToken[:])
	}

	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		log.Fatalf("failed to bind Axon PTY host to loopback: %v", err)
	}
	log.Printf("Axon PTY host listening on %s", listener.Addr())
	server := &http.Server{
		Handler:           ptyhost.New(authToken).Router(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}
	log.Fatal(server.Serve(listener))
}
