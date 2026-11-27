// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package models

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/server"
)

func TestMapModelsFiltersAndNamesProviders(t *testing.T) {
	disabled := false
	bigPickle := client.Model{ID: "big-pickle", ProviderID: "opencode", Name: "Big Pickle"}
	bigPickle.Capabilities.Tools = true
	models := []client.Model{
		bigPickle,
		{ID: "retired", ProviderID: "opencode", Status: "deprecated"},
		{ID: "embed", ProviderID: "opencode", Type: "embedding"},
		{ID: "hidden", ProviderID: "opencode", Enabled: &disabled},
	}
	providers := []client.Provider{{ID: "opencode", Name: "OpenCode"}}

	mapped := mapModels(models, providers)
	if len(mapped) != 1 {
		t.Fatalf("mapped count = %d", len(mapped))
	}
	model := mapped[0]
	if model.ID != "opencode/big-pickle" || model.ProviderLabel != "OpenCode" {
		t.Fatalf("mapped model = %#v", model)
	}
	if model.Backend != "opencode" || model.ProviderID != "opencode" || model.ModelID != "big-pickle" {
		t.Fatalf("routing fields = %#v", model)
	}
	if !strings.Contains(model.Description, "tools") {
		t.Fatalf("description = %q", model.Description)
	}
	if !model.Available {
		t.Fatal("OpenCode models should be selectable before an account check")
	}
}

func TestMapModelsMarksPaidOpenCodeGoModels(t *testing.T) {
	mapped := mapModels(
		[]client.Model{
			{ID: "glm-5", ProviderID: "opencode-go", Name: "GLM 5"},
			{ID: "longcat-free", ProviderID: "opencode-go", Name: "LongCat Free"},
		},
		[]client.Provider{{ID: "opencode-go", Name: "OpenCode Go"}},
	)

	if !strings.Contains(mapped[0].Description, "account") {
		t.Fatalf("paid model description = %q", mapped[0].Description)
	}
	if strings.Contains(mapped[1].Description, "account") {
		t.Fatalf("free model description = %q", mapped[1].Description)
	}
}

// OpenCode answers /api/model with an empty list while the provider catalog is
// still loading. A single read made the terminal show no OpenCode models even
// though the same server reported them a moment later.
func TestLoadCatalogWaitsForModelsToPopulate(t *testing.T) {
	var modelCalls atomic.Int32
	httpServer := httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			switch r.URL.Path {
			case "/api/model":
				if modelCalls.Add(1) == 1 {
					_, _ = w.Write([]byte(`{"data":[]}`))
					return
				}
				_, _ = w.Write([]byte(`{"data":[{"id":"big-pickle","modelID":"big-pickle","providerID":"opencode","type":"chat","name":"Big Pickle"}]}`))
			case "/api/provider":
				_, _ = w.Write([]byte(`{"data":[{"id":"opencode","name":"OpenCode"}]}`))
			default:
				http.NotFound(w, r)
			}
		},
	))
	defer httpServer.Close()

	api := client.New(&server.Handle{BaseURL: httpServer.URL, Password: "test"})
	catalog, err := loadCatalog(context.Background(), api)
	if err != nil {
		t.Fatalf("loadCatalog error = %v", err)
	}
	if len(catalog) != 1 || catalog[0].ID != "opencode/big-pickle" {
		t.Fatalf("catalog = %#v", catalog)
	}
}

func TestLoadCatalogKeepsModelsWhenProviderNamesFail(t *testing.T) {
	httpServer := httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			switch r.URL.Path {
			case "/api/model":
				_, _ = w.Write([]byte(`{"data":[{"id":"big-pickle","providerID":"opencode","type":"chat","name":"Big Pickle"}]}`))
			case "/api/provider":
				http.Error(w, "not ready", http.StatusInternalServerError)
			default:
				http.NotFound(w, r)
			}
		},
	))
	defer httpServer.Close()

	api := client.New(&server.Handle{BaseURL: httpServer.URL, Password: "test"})
	catalog, err := loadCatalog(context.Background(), api)
	if err != nil {
		t.Fatalf("loadCatalog error = %v", err)
	}
	if len(catalog) != 1 || catalog[0].ProviderLabel != "opencode" {
		t.Fatalf("catalog = %#v", catalog)
	}
}
