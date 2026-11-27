// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package models

import (
	"context"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/server"
	"github.com/GordenArcher/axon-core/internal/ai"
)

// The model endpoint answers before the provider catalog has populated, so a
// single read right after /api/info can return 200 with an empty list. Polling
// briefly catches that window without making a genuinely model-less install
// wait forever.
const (
	catalogReadyTimeout = 3 * time.Second
	catalogPollInterval = 150 * time.Millisecond
)

// Load merges the OpenCode catalog into Axon's model list. A missing OpenCode
// install is not an error: the CLI still runs with the local Axon models it
// already has.
func Load(ctx context.Context, folder string) ([]ai.ModelInfo, error) {
	if strings.TrimSpace(folder) == "" {
		return nil, nil
	}
	if _, err := server.Detect(); err != nil {
		return nil, nil
	}
	handle, err := server.Ensure(ctx, folder)
	if err != nil {
		return nil, err
	}
	return loadCatalog(ctx, client.New(handle))
}

// loadCatalog waits for the provider catalog to become usable. OpenCode
// reports a ready server through /api/info before /api/model has entries, so
// treating the first empty response as final is what made the terminal show no
// OpenCode models while the sidebar, which refreshes later, showed them all.
func loadCatalog(
	ctx context.Context,
	api *client.Client,
) ([]ai.ModelInfo, error) {
	deadline := time.Now().Add(catalogReadyTimeout)
	var lastErr error

	for {
		modelList, err := api.Models(ctx)
		if err == nil && len(modelList) > 0 {
			// Provider names only affect headings. A failed provider lookup
			// must not hide models that are ready to run.
			providerList, providerErr := api.Providers(ctx)
			if providerErr != nil {
				providerList = nil
			}
			return mapModels(modelList, providerList), nil
		}
		if err != nil {
			lastErr = err
		}

		if time.Now().After(deadline) {
			return nil, lastErr
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(catalogPollInterval):
		}
	}
}

// mapModels gives each entry the same shape the sidebar uses. Availability is
// always true because OpenCode decides whether an account or key is missing
// when the prompt runs; hiding those models here would make the terminal
// catalog disagree with the sidebar for the same install.
func mapModels(models []client.Model, providers []client.Provider) []ai.ModelInfo {
	providerNames := make(map[string]string, len(providers))
	for _, provider := range providers {
		providerNames[provider.ID] = provider.Name
	}

	seen := make(map[string]bool)
	result := make([]ai.ModelInfo, 0, len(models))
	for _, model := range models {
		if model.Enabled != nil && !*model.Enabled {
			continue
		}
		if model.Status == "deprecated" {
			continue
		}
		if model.Type != "" && model.Type != "chat" {
			continue
		}
		modelID := model.ModelID
		if modelID == "" {
			modelID = model.ID
		}
		if modelID == "" || model.ProviderID == "" {
			continue
		}
		id := model.ProviderID + "/" + modelID
		if seen[id] {
			continue
		}
		seen[id] = true

		providerLabel := providerNames[model.ProviderID]
		if providerLabel == "" {
			providerLabel = model.ProviderID
		}
		capability := "text"
		if model.Capabilities.Tools {
			capability = "tools"
		}
		description := providerLabel + " · " + capability
		if model.ProviderID == "opencode-go" && !strings.Contains(modelID, "free") {
			description += " · account"
		}
		label := model.Name
		if label == "" {
			label = modelID
		}
		result = append(result, ai.ModelInfo{
			ID:            id,
			Label:         label,
			Description:   description,
			ProviderLabel: providerLabel,
			Available:     true,
			Backend:       "opencode",
			ProviderID:    model.ProviderID,
			ModelID:       modelID,
			Compatibility: ai.ModelCompatibilityGreat,
		})
	}
	return result
}
