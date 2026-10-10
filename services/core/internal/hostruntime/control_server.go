// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package hostruntime

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"
)

// NewControlHTTPServer builds the low-volume server used for health, capability
// tickets, and other control traffic over the private transport.
func NewControlHTTPServer(handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}
}

// ServeControlTransport keeps control traffic attached to the socket pathname
// Electron knows. An unrelated or nested Axon process can unlink and replace a
// Unix socket without closing the original listener; the old host then keeps its
// live sessions but can never issue another capability ticket. Periodically
// comparing the bound listener with the current path lets this host reclaim its
// process-private endpoint without restarting what is running behind the public
// stream server. label names the service in diagnostics.
func ServeControlTransport(
	ctx context.Context,
	handler http.Handler,
	controlPath string,
	authToken string,
	label string,
	initialListener net.Listener,
	initialCleanup func(),
	ownershipCheckInterval time.Duration,
) error {
	const probeFailuresBeforeRebind = 3
	listener := initialListener
	cleanup := initialCleanup
	consecutiveProbeFailures := 0

	for {
		server := NewControlHTTPServer(handler)
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
				return fmt.Errorf("Axon %s control transport stopped: %w", label, err)
			case <-ticker.C:
				if ControlPathReachesHost(controlPath, authToken) {
					consecutiveProbeFailures = 0
					continue
				}
				consecutiveProbeFailures++
				// A busy machine can miss one short local probe without losing the
				// socket. Rebinding only after consecutive authenticated failures
				// avoids turning transient scheduler pressure into a control-plane
				// restart while still repairing a replaced path before Electron's
				// slower watchdog asks to kill the whole host.
				shouldRebind = consecutiveProbeFailures >= probeFailuresBeforeRebind
			}
		}

		ticker.Stop()
		log.Printf("Axon %s control socket identity changed; rebinding %s", label, controlPath)
		_ = server.Close()
		cleanup()
		reboundListener, reboundCleanup, err := ListenControl(controlPath)
		if err != nil {
			return fmt.Errorf("failed to rebind Axon %s control transport: %w", label, err)
		}
		listener = reboundListener
		cleanup = reboundCleanup
		consecutiveProbeFailures = 0
	}
}
