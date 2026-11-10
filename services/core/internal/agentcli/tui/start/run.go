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
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	"github.com/GordenArcher/axon-core/internal/agentcli/coreproc"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/ai"
	tea "github.com/charmbracelet/bubbletea"
)

func Run(workspace string) int {
	program := tea.NewProgram(
		app.NewModel(workspace, resolveModel()),
		tea.WithAltScreen(),
		tea.WithMouseCellMotion(),
	)
	if _, err := program.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

// resolveModel asks the local runtime which model is actually installed. The
// editor normally starts the runtime, but a terminal-only launch has to do it
// itself; otherwise the first prompt fails with "model is not installed" even
// though another catalog model is ready.
func resolveModel() string {
	requested := requestedModel()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	port := coreproc.ResolveCorePort()
	if err := coreproc.EnsureCore(ctx, port); err != nil {
		return requested
	}

	status, err := fetchRuntimeStatus(ctx, port, requested)
	if err != nil {
		return requested
	}
	if status.SelectedModelInstalled {
		return requested
	}
	for _, model := range status.Models {
		if model.Available && model.Compatibility != ai.ModelCompatibilityUnsupported {
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
