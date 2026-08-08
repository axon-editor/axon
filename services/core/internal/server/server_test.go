package server

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

const testCoreToken = "test-core-token"

func authenticatedRequest(method string, target string, body []byte) *http.Request {
	request := httptest.NewRequest(method, target, bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+testCoreToken)
	return request
}

func TestRouterRejectsRequestsWithoutCoreToken(t *testing.T) {
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/health", nil),
	)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without core token, got %d", recorder.Code)
	}
}

func TestHealthProvesCoreOwnsTheSharedToken(t *testing.T) {
	request := authenticatedRequest(http.MethodGet, "/health", nil)
	request.Header.Set("X-Axon-Challenge", "ownership-check")
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(recorder, request)

	mac := hmac.New(sha256.New, []byte(testCoreToken))
	_, _ = mac.Write([]byte("ownership-check"))
	expectedProof := hex.EncodeToString(mac.Sum(nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected authenticated health response, got %d", recorder.Code)
	}
	if recorder.Header().Get("X-Axon-Core-Proof") != expectedProof {
		t.Fatal("health response did not prove ownership of the launch token")
	}
}

func TestRouterRejectsUntrustedBrowserOrigin(t *testing.T) {
	request := authenticatedRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "https://attacker.example")
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected hostile browser origin to be rejected, got %d", recorder.Code)
	}
}

func TestCreateRouteCannotEscapeWorkspace(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(t.TempDir(), "outside.txt")
	body := []byte(`{"root":` + strconv.Quote(root) + `,"path":` + strconv.Quote(target) + `,"is_dir":false}`)
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodPost, "/fs/create", body),
	)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected escaped create to be rejected, got %d", recorder.Code)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatal("escaped create wrote outside the workspace")
	}
}

func TestDeleteRouteRefusesWorkspaceRoot(t *testing.T) {
	root := t.TempDir()
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(
			http.MethodDelete,
			"/fs/delete?path="+url.QueryEscape(root)+"&root="+url.QueryEscape(root),
			nil,
		),
	)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected workspace root deletion to be rejected, got %d", recorder.Code)
	}
	if _, err := os.Stat(root); err != nil {
		t.Fatalf("workspace root was removed: %v", err)
	}
}

func TestTreeRouteAllowsReadingRegisteredRoot(t *testing.T) {
	root := t.TempDir()
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(
			http.MethodGet,
			"/fs/tree?path="+url.QueryEscape(root)+"&root="+url.QueryEscape(root),
			nil,
		),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected workspace root tree to remain readable, got %d", recorder.Code)
	}
}

func TestValidateWorkspacePathAllowsExistingFileInsideWorkspace(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "src", "main.go")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := validateWorkspacePath(root, target); err != nil {
		t.Fatalf("expected path inside workspace to be allowed: %v", err)
	}
}

func TestValidateWorkspacePathRejectsParentTraversal(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(filepath.Dir(root), "outside.txt")

	if err := validateWorkspacePath(root, outside); err == nil {
		t.Fatal("expected path outside workspace to be rejected")
	}
}

func TestValidateWorkspacePathRejectsExistingSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on some Windows setups")
	}

	root := t.TempDir()
	outsideDir := t.TempDir()
	outsideFile := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(outsideFile, []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	linkPath := filepath.Join(root, "linked-secret.txt")
	if err := os.Symlink(outsideFile, linkPath); err != nil {
		t.Fatal(err)
	}

	if err := validateWorkspacePath(root, linkPath); err == nil {
		t.Fatal("expected symlink target outside workspace to be rejected")
	}
}

func TestValidateWorkspacePathRejectsNewFileUnderSymlinkedDirectoryEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on some Windows setups")
	}

	root := t.TempDir()
	outsideDir := t.TempDir()
	linkDir := filepath.Join(root, "external")
	if err := os.Symlink(outsideDir, linkDir); err != nil {
		t.Fatal(err)
	}

	target := filepath.Join(linkDir, "new-file.txt")
	if err := validateWorkspacePath(root, target); err == nil {
		t.Fatal("expected new file under symlinked outside directory to be rejected")
	}
}
