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

	host := ptyhost.New(authToken)
	controlPath := strings.TrimSpace(os.Getenv("AXON_PTY_CONTROL"))
	if controlPath != "" {
		controlListener, cleanup, err := listenControl(controlPath)
		if err != nil {
			log.Fatalf("failed to bind Axon PTY control transport: %v", err)
		}
		defer cleanup()
		controlServer := &http.Server{
			Handler:           host.ControlRouter(),
			ReadHeaderTimeout: 5 * time.Second,
			IdleTimeout:       30 * time.Second,
			MaxHeaderBytes:    64 << 10,
		}
		go func() {
			if err := controlServer.Serve(controlListener); err != nil && err != http.ErrServerClosed {
				// Ticket issuance and health checks live exclusively on this private
				// transport. Keeping the WebSocket listener alive after the control
				// socket fails creates a half-alive host that can preserve old streams
				// but can never open a new terminal. Exiting makes the failure visible
				// to Electron's service controller, which can recover the host on the
				// next ticket request instead of retrying a refused socket forever.
				log.Fatalf("Axon PTY control transport stopped: %v", err)
			}
		}()
	}

	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		log.Fatalf("failed to bind Axon PTY host to loopback: %v", err)
	}
	log.Printf("Axon PTY host listening on %s", listener.Addr())
	streamHandler := host.Router()
	if controlPath != "" {
		streamHandler = host.StreamRouter()
	}
	server := &http.Server{
		Handler:           streamHandler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}
	log.Fatal(server.Serve(listener))
}
