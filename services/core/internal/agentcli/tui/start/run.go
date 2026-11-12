// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package start

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	"github.com/GordenArcher/axon-core/internal/agentcli/coreproc"
	openmodels "github.com/GordenArcher/axon-core/internal/agentcli/opencode/models"
	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/server"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/ai"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	tea "github.com/charmbracelet/bubbletea"
)

// Starting OpenCode is slower than asking the local runtime, so startup gets
// one budget for both catalogs instead of a second independent timeout.
const runtimeResolveTimeout = 20 * time.Second

func Run(workspace string, resume bool) int {
	modelID, modelList := resolveRuntime(workspace)
	// The CLI owns any OpenCode server it starts. Leaving it behind would keep
	// an unowned process and port alive after the terminal closes.
	defer func() {
		_ = server.Stop()
	}()

	// A terminal SIGTERM skips Bubble Tea's deferred cleanup, which would leave
	// the managed OpenCode server running after the process is gone. SIGINT is
	// not handled here because the TUI owns Ctrl+C and runs its normal exit path.
	terminate := make(chan os.Signal, 1)
	signal.Notify(terminate, syscall.SIGTERM)
	defer signal.Stop(terminate)
	go func() {
		<-terminate
		_ = server.Stop()
		os.Exit(0)
	}()

	// Session persistence is part of the product, not a best-effort extra.
	// Failing here with the database path is better than launching a TUI that
	// silently drops every conversation the user expects to resume.
	sessions, err := store.Open()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer func() {
		_ = sessions.Close()
	}()

	program := tea.NewProgram(
		app.NewModel(workspace, modelID, modelList, resume, sessions),
		tea.WithAltScreen(),
		// Wheel scrolling is the primary way to move through a transcript.
		// Ctrl+Y temporarily disables mouse capture for native selection/copy.
		tea.WithMouseCellMotion(),
	)
	if _, err := program.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

// resolveRuntime asks the local runtime which model is actually installed. The
// editor normally starts the runtime, but a terminal-only launch has to do it
// itself; otherwise the first prompt fails with "model is not installed" even
// though another catalog model is ready. OpenCode models are merged into the
// same list so a terminal has the same catalog as the sidebar.
func resolveRuntime(workspace string) (string, []ai.ModelInfo) {
	requested := requestedModel()

	ctx, cancel := context.WithTimeout(context.Background(), runtimeResolveTimeout)
	defer cancel()

	modelList := make([]ai.ModelInfo, 0, 32)
	port := coreproc.ResolveCorePort()
	if err := coreproc.EnsureCore(ctx, port); err == nil {
		if status, err := fetchRuntimeStatus(ctx, port, requested); err == nil {
			modelList = append(modelList, status.Models...)
		}
	}

	// A failed OpenCode start must not hide the local models that are already
	// ready. The error stays out of startup because the picker can still show
	// the remaining catalog and the next refresh can pick OpenCode up.
	if openCodeModels, err := openmodels.Load(ctx, workspace); err == nil {
		modelList = append(modelList, openCodeModels...)
	}

	return chosenModel(requested, modelList), modelList
}

func chosenModel(requested string, modelList []ai.ModelInfo) string {
	for _, model := range modelList {
		if model.ID == requested &&
			model.Available &&
			model.Compatibility != ai.ModelCompatibilityUnsupported {
			return requested
		}
	}
	for _, model := range modelList {
		if model.Available &&
			model.Compatibility != ai.ModelCompatibilityUnsupported {
			return model.ID
		}
	}
	return requested
}

func requestedModel() string {
	if model := strings.TrimSpace(os.Getenv("AXON_AGENT_MODEL")); model != "" {
		return model
	}
	config := configstore.Load()
	if strings.TrimSpace(config.SelectedModel) != "" {
		return strings.TrimSpace(config.SelectedModel)
	}
	return "axon-code"
}

func fetchRuntimeStatus(
	ctx context.Context,
	port string,
	model string,
) (ai.RuntimeStatus, error) {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		coreproc.CoreURL(port, "/ai/runtime?model="+url.QueryEscape(model)),
		nil,
	)
	if err != nil {
		return ai.RuntimeStatus{}, err
	}
	coreproc.AuthorizeCoreRequest(request)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return ai.RuntimeStatus{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ai.RuntimeStatus{}, fmt.Errorf("runtime status returned %d", response.StatusCode)
	}

	var envelope struct {
		Data ai.RuntimeStatus `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		return ai.RuntimeStatus{}, err
	}
	return envelope.Data, nil
}
