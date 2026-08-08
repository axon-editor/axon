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
