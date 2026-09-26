// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ptyhost

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"
)

const testToken = "test-pty-token"

func authenticatedRequest(method string, target string, body []byte) *http.Request {
	request := httptest.NewRequest(method, target, bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+testToken)
	return request
}

func TestShellRouteReportsTheResolvedShellOverAuthentication(t *testing.T) {
	host := New(testToken)

	unauthenticated := httptest.NewRecorder()
	host.Router().ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/terminal/shell", nil))
	if unauthenticated.Code != http.StatusUnauthorized {
		t.Fatalf("expected the shell route to require authentication, got %d", unauthenticated.Code)
	}

	recorder := httptest.NewRecorder()
	host.Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodGet, "/terminal/shell", nil),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected the resolved shell, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data struct {
			Shell string `json:"shell"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("could not decode shell response: %v", err)
	}
	// The editor reads this to find the history file of the shell that will really
	// run, so an empty answer would silently disable inline suggestions.
	if response.Data.Shell == "" {
		t.Fatal("expected a shell path, got none")
	}
}

func TestTerminalTicketsAreSingleUseAndWorkspaceBound(t *testing.T) {
	host := New(testToken)
	workspace := t.TempDir()
	recorder := httptest.NewRecorder()
	host.Router().ServeHTTP(
		recorder,
		authenticatedRequest(
			http.MethodPost,
			"/terminal/ticket",
			[]byte(`{"cwd":`+strconv.Quote(workspace)+`,"workspaceRoot":`+strconv.Quote(workspace)+`}`),
		),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected terminal ticket, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data struct {
			Ticket string `json:"ticket"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodGet,
		"/terminal?ticket="+url.QueryEscape(response.Data.Ticket)+"&cwd="+url.QueryEscape(workspace)+"&workspaceRoot="+url.QueryEscape(workspace),
		nil,
	)
	if !host.authenticated(request) {
		t.Fatal("fresh workspace-bound terminal ticket was rejected")
	}
	if host.authenticated(request) {
		t.Fatal("terminal ticket could be replayed")
	}
}

func TestTerminalTicketRejectsChangedWorkspace(t *testing.T) {
	host := New(testToken)
	workspace := t.TempDir()
	host.tickets["scoped-ticket"] = terminalTicket{
		expiresAt:     time.Now().Add(time.Minute),
		cwd:           workspace,
		workspaceRoot: workspace,
	}
	request := httptest.NewRequest(
		http.MethodGet,
		"/terminal?ticket=scoped-ticket&cwd="+url.QueryEscape(workspace)+"&workspaceRoot="+url.QueryEscape(t.TempDir()),
		nil,
	)
	if host.authenticated(request) {
		t.Fatal("terminal ticket was accepted for a different workspace")
	}
}

func TestTerminalRouteRejectsReusableTokenInQuery(t *testing.T) {
	host := New(testToken)
	request := httptest.NewRequest(
		http.MethodGet,
		"/terminal?access_token="+url.QueryEscape(testToken),
		nil,
	)
	if host.authenticated(request) {
		t.Fatal("terminal route accepted the reusable host token from a URL")
	}
}

func TestPackagedRoutersKeepControlAndStreamRoutesSeparate(t *testing.T) {
	host := New(testToken)
	controlRecorder := httptest.NewRecorder()
	host.ControlRouter().ServeHTTP(
		controlRecorder,
		authenticatedRequest(http.MethodGet, "/terminal", nil),
	)
	if controlRecorder.Code != http.StatusNotFound {
		t.Fatalf("control transport exposed terminal stream: %d", controlRecorder.Code)
	}

	streamRecorder := httptest.NewRecorder()
	host.StreamRouter().ServeHTTP(
		streamRecorder,
		authenticatedRequest(http.MethodGet, "/health", nil),
	)
	if streamRecorder.Code != http.StatusNotFound {
		t.Fatalf("stream listener exposed control health: %d", streamRecorder.Code)
	}
}
