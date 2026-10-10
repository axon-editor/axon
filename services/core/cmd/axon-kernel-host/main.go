// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

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

	"github.com/GordenArcher/axon-core/internal/hostruntime"
	"github.com/GordenArcher/axon-core/internal/kernelhost"
)

func main() {
	closeLog, logErr := hostruntime.ConfigureHostLogging(strings.TrimSpace(os.Getenv("AXON_KERNEL_LOG_PATH")))
	if logErr != nil {
		log.Printf("failed to configure persistent kernel host logging: %v", logErr)
	}
	defer closeLog()

	port := strings.TrimSpace(os.Getenv("AXON_KERNEL_PORT"))
	if port == "" {
		port = "7779"
	}
	authToken := strings.TrimSpace(os.Getenv("AXON_KERNEL_TOKEN"))
	if authToken == "" {
		var rawToken [32]byte
		if _, err := rand.Read(rawToken[:]); err != nil {
			log.Fatalf("failed to generate kernel host authentication token: %v", err)
		}
		authToken = hex.EncodeToString(rawToken[:])
	}

	host := kernelhost.New(authToken)
	// I reserve the WebSocket stream port before creating the private control
	// socket. If an orphaned host still owns this port, startup now fails without
	// replacing its socket path with a second listener that immediately exits.
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		log.Fatalf("failed to bind Axon kernel host to loopback: %v", err)
	}
	defer listener.Close()

	controlPath := strings.TrimSpace(os.Getenv("AXON_KERNEL_CONTROL"))
	var controlListener net.Listener
	cleanupControl := func() {}
	if controlPath != "" {
		controlListener, cleanupControl, err = hostruntime.ListenControl(controlPath)
		if err != nil {
			_ = listener.Close()
			log.Fatalf("failed to bind Axon kernel control transport: %v", err)
		}
		defer cleanupControl()
	}

	log.Printf("Axon kernel host listening on %s", listener.Addr())
	ownerLost := hostruntime.MonitorOwnerPipe(
		strings.TrimSpace(os.Getenv("AXON_KERNEL_OWNER_STDIN")) == "1",
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

	reaperContext, cancelReaper := context.WithCancel(context.Background())
	defer cancelReaper()
	host.StartReaper(reaperContext)

	serveErrors := make(chan error, 2)
	go func() {
		err := streamServer.Serve(listener)
		if err == http.ErrServerClosed {
			err = nil
		}
		if err != nil {
			serveErrors <- fmt.Errorf("Axon kernel stream transport stopped: %w", err)
			return
		}
		serveErrors <- nil
	}()

	controlContext, cancelControl := context.WithCancel(context.Background())
	defer cancelControl()
	if controlListener != nil {
		go func() {
			serveErrors <- hostruntime.ServeControlTransport(
				controlContext,
				host.ControlRouter(),
				controlPath,
				authToken,
				"kernel",
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
		// Electron owns this host and every kernel inside it. The dedicated stdin
		// pipe reaches EOF even when Electron is force-killed and cannot run its
		// normal before-quit cleanup. Closing every kernel here stops interpreter
		// processes from surviving as orphaned children of an empty host.
		log.Printf("Axon kernel host owner disconnected; shutting down owned kernels")
		host.CloseAll()
	}
}
