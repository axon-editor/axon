package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"
)

func newControlHTTPServer(handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}
}

// serveControlTransport keeps ticket and health traffic attached to the Unix
// socket pathname Electron knows. An unrelated or nested Axon process can
// unlink and replace a Unix socket without closing the original listener; the
// old host then keeps streaming existing PTYs but can never issue another
// terminal ticket. Periodically comparing the bound listener with the current
// path lets this host reclaim its process-private endpoint without restarting
// the PTYs that are still running behind the TCP stream server.
func serveControlTransport(
	ctx context.Context,
	handler http.Handler,
	controlPath string,
	authToken string,
	initialListener net.Listener,
	initialCleanup func(),
	ownershipCheckInterval time.Duration,
) error {
	const probeFailuresBeforeRebind = 3
	listener := initialListener
	cleanup := initialCleanup
	consecutiveProbeFailures := 0

	for {
		server := newControlHTTPServer(handler)
		serveDone := make(chan error, 1)
		go func(activeListener net.Listener) {
			err := server.Serve(activeListener)
			if err == http.ErrServerClosed {
				err = nil
			}
			serveDone <- err
		}(listener)

		ticker := time.NewTicker(ownershipCheckInterval)
		shouldRebind := false
		for !shouldRebind {
			select {
			case <-ctx.Done():
				ticker.Stop()
				_ = server.Close()
				cleanup()
				return nil
			case err := <-serveDone:
				ticker.Stop()
				cleanup()
				if err == nil {
					return nil
				}
				return fmt.Errorf("Axon PTY control transport stopped: %w", err)
			case <-ticker.C:
				if controlPathReachesHost(controlPath, authToken) {
					consecutiveProbeFailures = 0
					continue
				}
				consecutiveProbeFailures++
				// A busy machine can miss one short local probe without losing
				// the socket. Rebinding only after consecutive authenticated
				// failures avoids turning transient scheduler pressure into a
				// control-plane restart while still repairing a replaced path
				// before Electron's slower watchdog asks to kill the whole host.
				shouldRebind = consecutiveProbeFailures >= probeFailuresBeforeRebind
			}
		}

		ticker.Stop()
		log.Printf("Axon PTY control socket identity changed; rebinding %s", controlPath)
		_ = server.Close()
		cleanup()
		reboundListener, reboundCleanup, err := listenControl(controlPath)
		if err != nil {
			return fmt.Errorf("failed to rebind Axon PTY control transport: %w", err)
		}
		listener = reboundListener
		cleanup = reboundCleanup
		consecutiveProbeFailures = 0
	}
}
