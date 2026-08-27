package main

import (
	"context"
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
	closeLog, logErr := configureHostLogging(strings.TrimSpace(os.Getenv("AXON_PTY_LOG_PATH")))
	if logErr != nil {
		log.Printf("failed to configure persistent PTY host logging: %v", logErr)
	}
	defer closeLog()

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
	ownerLost := monitorOwnerPipe(
		strings.TrimSpace(os.Getenv("AXON_PTY_OWNER_STDIN")) == "1",
	)

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

	controlContext, cancelControl := context.WithCancel(context.Background())
	defer cancelControl()
	if controlListener != nil {
		go func() {
			serveErrors <- serveControlTransport(
				controlContext,
				host.ControlRouter(),
				controlPath,
				authToken,
				controlListener,
				cleanupControl,
				5*time.Second,
			)
		}()
	}

	select {
	case err := <-serveErrors:
		if err != nil {
			log.Printf("%v", err)
		}
	case <-ownerLost:
		// Electron owns this host and all PTYs inside it. The dedicated stdin
		// pipe reaches EOF even when Electron is force-killed and cannot run its
		// normal before-quit cleanup. Returning from main closes both listeners
		// and the PTY masters, so macOS cannot reparent an empty hidden host to
		// PID 1 and leave its private port alive indefinitely.
		log.Printf("Axon PTY host owner disconnected; shutting down owned terminal sessions")
	}
}
