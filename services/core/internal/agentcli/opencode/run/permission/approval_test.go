// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package permission

import (
	"encoding/json"
	"testing"

	opencodeclient "github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	tuiclient "github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

func TestFromDataRejectsIncompleteFrames(t *testing.T) {
	if _, ok := FromData(map[string]any{"action": "bash"}); ok {
		t.Fatal("missing id was accepted")
	}
	request, ok := FromData(map[string]any{
		"id":        "permission-1",
		"action":    "bash",
		"resources": []any{"rm -rf build"},
	})
	if !ok {
		t.Fatal("valid permission was rejected")
	}
	if request.ID != "permission-1" || len(request.Resources) != 1 {
		t.Fatalf("decoded request = %#v", request)
	}
}

func TestArgumentsMapTheFirstResource(t *testing.T) {
	request := opencodeclient.PermissionRequest{
		Action:    "bash",
		Resources: []string{"go test ./..."},
	}
	var arguments map[string]string
	if err := json.Unmarshal([]byte(Arguments(request)), &arguments); err != nil {
		t.Fatalf("arguments are not JSON: %v", err)
	}
	if arguments["command"] != "go test ./..." {
		t.Fatalf("command = %q", arguments["command"])
	}
}

func TestDecisionNameUsesAlwaysOnlyForSessionAllow(t *testing.T) {
	cases := []struct {
		decision tuiclient.Decision
		expected string
	}{
		{tuiclient.Decision{Approved: false}, "reject"},
		{tuiclient.Decision{Approved: true}, "once"},
		{tuiclient.Decision{Approved: true, AllowSession: true}, "always"},
	}
	for _, testCase := range cases {
		if actual := DecisionName(testCase.decision); actual != testCase.expected {
			t.Fatalf("decision = %q, want %q", actual, testCase.expected)
		}
	}
}
