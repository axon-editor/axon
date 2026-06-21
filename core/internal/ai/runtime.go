package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type RuntimeStatus struct {
	Installed              bool        `json:"installed"`
	Running                bool        `json:"running"`
	StartedByAxon          bool        `json:"startedByAxon"`
	ProviderLabel          string      `json:"providerLabel"`
	SelectedModel          string      `json:"selectedModel"`
	SelectedModelInstalled bool        `json:"selectedModelInstalled"`
	Models                 []ModelInfo `json:"models"`
	Detail                 string      `json:"detail"`
	InstallHint            string      `json:"installHint"`
}

type PullRequest struct {
	Model string `json:"model"`
}

type PullEvent struct {
	Type      string `json:"type"`
	Status    string `json:"status,omitempty"`
	Model     string `json:"model"`
	Completed int64  `json:"completed,omitempty"`
	Total     int64  `json:"total,omitempty"`
	Error     string `json:"error,omitempty"`
	Done      bool   `json:"done,omitempty"`
}

type pullRuntimeChunk struct {
	Status    string `json:"status"`
	Completed int64  `json:"completed"`
	Total     int64  `json:"total"`
	Error     string `json:"error"`
	Done      bool   `json:"done"`
}

var runtimeProcess = struct {
	sync.Mutex
	started bool
	cmd     *exec.Cmd
}{}

func RuntimeBinaryPath() (string, bool) {
	if binaryPath, err := exec.LookPath("ollama"); err == nil {
		return binaryPath, true
	}

	// Packaged macOS apps do not inherit the same PATH as an interactive shell,
	// so exec.LookPath can miss a perfectly valid Homebrew install. I check the
	// common install locations explicitly so opening Axon from Finder can still
	// start the local Axon models runtime without asking the user to run a
	// terminal command first.
	for _, candidate := range []string{
		"/opt/homebrew/bin/ollama",
		"/usr/local/bin/ollama",
		"/Applications/Ollama.app/Contents/Resources/ollama",
	} {
		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() {
			return candidate, true
		}
	}

	return "", false
}

func CheckRuntimeRunning(ctx context.Context) bool {
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, ModelBaseURL()+"/api/tags", nil)
	if err != nil {
		return false
	}
	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 500
}

func StartRuntime(ctx context.Context) error {
	if CheckRuntimeRunning(ctx) {
		return nil
	}

	binaryPath, installed := RuntimeBinaryPath()
	if !installed {
		return errors.New("Axon models runtime is not installed")
	}

	runtimeProcess.Lock()
	if runtimeProcess.cmd == nil || runtimeProcess.cmd.ProcessState != nil {
		cmd := exec.Command(binaryPath, "serve")
		if err := cmd.Start(); err != nil {
			runtimeProcess.Unlock()
			return err
		}
		runtimeProcess.cmd = cmd
		runtimeProcess.started = true
		go func() {
			_ = cmd.Wait()
			runtimeProcess.Lock()
			if runtimeProcess.cmd == cmd {
				runtimeProcess.cmd = nil
			}
			runtimeProcess.Unlock()
		}()
	}
	runtimeProcess.Unlock()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if CheckRuntimeRunning(ctx) {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return errors.New("Axon models runtime did not become ready")
}

func EnsureRuntimeStatus(ctx context.Context, selectedModel string) RuntimeStatus {
	modelName := strings.TrimSpace(selectedModel)
	if modelName == "" {
		modelName = DefaultModelID()
	}

	_, installed := RuntimeBinaryPath()
	if !installed {
		return RuntimeStatus{
			Installed:     false,
			Running:       false,
			ProviderLabel: "Axon models",
			SelectedModel: modelName,
			Detail:        "Axon models runtime is not installed.",
			InstallHint:   "Install Ollama from https://ollama.com/download, then reopen Axon.",
		}
	}

	if err := StartRuntime(ctx); err != nil {
		return RuntimeStatus{
			Installed:     true,
			Running:       false,
			ProviderLabel: "Axon models",
			SelectedModel: modelName,
			Detail:        err.Error(),
			InstallHint:   "Axon found the local model runtime but could not start it automatically.",
		}
	}

	models, err := ListModels(ctx, modelName)
	if err != nil {
		return RuntimeStatus{
			Installed:     true,
			Running:       true,
			ProviderLabel: "Axon models",
			SelectedModel: modelName,
			Detail:        err.Error(),
		}
	}

	selectedInstalled := false
	for _, model := range models {
		if model.ID == modelName {
			selectedInstalled = model.Available
			break
		}
	}

	runtimeProcess.Lock()
	startedByAxon := runtimeProcess.started
	runtimeProcess.Unlock()

	return RuntimeStatus{
		Installed:              true,
		Running:                true,
		StartedByAxon:          startedByAxon,
		ProviderLabel:          "Axon models",
		SelectedModel:          modelName,
		SelectedModelInstalled: selectedInstalled,
		Models:                 models,
		Detail:                 "Axon models runtime is ready.",
	}
}

func PullModel(ctx context.Context, modelName string, emit func(PullEvent) error) error {
	model := strings.TrimSpace(modelName)
	if model == "" {
		return errors.New("model is required")
	}
	if err := StartRuntime(ctx); err != nil {
		return err
	}

	rawPayload, err := json.Marshal(map[string]any{
		"name":   RuntimeModelName(model),
		"stream": true,
	})
	if err != nil {
		return err
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, ModelBaseURL()+"/api/pull", bytes.NewReader(rawPayload))
	if err != nil {
		return err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("Axon models returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var chunk pullRuntimeChunk
		if err := json.Unmarshal([]byte(line), &chunk); err != nil {
			return err
		}
		if chunk.Error != "" {
			return errors.New(chunk.Error)
		}
		if err := emit(PullEvent{
			Type:      "progress",
			Status:    chunk.Status,
			Model:     model,
			Completed: chunk.Completed,
			Total:     chunk.Total,
			Done:      chunk.Done,
		}); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return emit(PullEvent{Type: "done", Status: "Model is ready.", Model: model, Done: true})
}
