package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
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
	// I reserve the WebSocket stream port before creating the private control
	// socket. If an orphaned host still owns this port, startup now fails without
	// replacing its socket path with a second listener that immediately exits.
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		log.Fatalf("failed to bind Axon PTY host to loopback: %v", err)
	}
	defer listener.Close()

	controlPath := strings.TrimSpace(os.Getenv("AXON_PTY_CONTROL"))
	var controlListener net.Listener
	cleanupControl := func() {}
	if controlPath != "" {
		controlListener, cleanupControl, err = listenControl(controlPath)
		if err != nil {
			_ = listener.Close()
			log.Fatalf("failed to bind Axon PTY control transport: %v", err)
		}
		defer cleanupControl()
	}

	log.Printf("Axon PTY host listening on %s", listener.Addr())
	streamHandler := host.Router()
	if controlPath != "" {
		streamHandler = host.StreamRouter()
	}
	streamServer := &http.Server{
		Handler:           streamHandler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}
	// Both transports are required for a healthy host: existing terminals use
	// the stream listener while health checks and new ticket issuance use the
	// control listener. Whichever server stops first ends main so deferred
	// cleanup removes the socket instead of leaving a half-alive host behind.
	serveErrors := make(chan error, 2)
	go func() {
		err := streamServer.Serve(listener)
		if err == http.ErrServerClosed {
			err = nil
		}
		if err != nil {
			serveErrors <- fmt.Errorf("Axon PTY stream transport stopped: %w", err)
			return
		}
		serveErrors <- nil
	}()

	if controlListener != nil {
		controlServer := &http.Server{
			Handler:           host.ControlRouter(),
			ReadHeaderTimeout: 5 * time.Second,
			IdleTimeout:       30 * time.Second,
			MaxHeaderBytes:    64 << 10,
		}
		go func() {
			err := controlServer.Serve(controlListener)
			if err == http.ErrServerClosed {
				err = nil
			}
			if err != nil {
				serveErrors <- fmt.Errorf("Axon PTY control transport stopped: %w", err)
				return
			}
			serveErrors <- nil
		}()
	}

	if err := <-serveErrors; err != nil {
		log.Printf("%v", err)
	}
}
