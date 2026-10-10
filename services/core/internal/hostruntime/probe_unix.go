// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build !windows

package hostruntime

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/http"
	"time"
)

// ControlPathReachesHost proves the socket at controlPath is still this process's
// listener. An unrelated process can unlink and replace a Unix socket pathname
// without closing the original listener, so the caller uses this to detect that
// its control endpoint was stolen and rebind before Electron's watchdog gives up
// on the host. The HMAC challenge-response also confirms the peer is holding the
// launch token rather than merely accepting connections.
func ControlPathReachesHost(controlPath string, authToken string) bool {
	challengeBytes := make([]byte, 24)
	if _, err := rand.Read(challengeBytes); err != nil {
		return false
	}
	challenge := hex.EncodeToString(challengeBytes)
	proof := hmac.New(sha256.New, []byte(authToken))
	_, _ = proof.Write([]byte(challenge))
	expectedProof := hex.EncodeToString(proof.Sum(nil))

	transport := &http.Transport{
		DisableKeepAlives: true,
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 300 * time.Millisecond}).DialContext(ctx, "unix", controlPath)
		},
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 500 * time.Millisecond}
	request, err := http.NewRequest(http.MethodGet, "http://axon.local/health", nil)
	if err != nil {
		return false
	}
	request.Header.Set("Authorization", "Bearer "+authToken)
	request.Header.Set("X-Axon-Challenge", challenge)

	response, err := client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusOK &&
		response.Header.Get("X-Axon-Core-Proof") == expectedProof
}
