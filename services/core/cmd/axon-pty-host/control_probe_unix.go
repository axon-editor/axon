//go:build !windows

package main

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

func controlPathReachesHost(controlPath string, authToken string) bool {
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
			return (&net.Dialer{Timeout: 300 * time.Millisecond}).DialContext(
				ctx,
				"unix",
				controlPath,
			)
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
