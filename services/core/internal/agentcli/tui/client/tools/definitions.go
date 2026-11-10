// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tools

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/coreproc"
	"github.com/GordenArcher/axon-core/internal/ai"
)

const (
	WriteFileTool       = "write_file"
	CreateDirectoryTool = "create_directory"
	RunCommandTool      = "run_command"
)

// Definitions merges core's read-only workspace tools with the mutating tools
// the CLI executes locally. Core stays read-only so the editor's own approval
// loop does not accidentally gain a second, unapproved write path.
func Definitions(ctx context.Context, port string) []ai.ProjectToolDefinition {
	remote := fetchWorkspaceDefinitions(ctx, port)
	if len(remote) == 0 {
		remote = ai.ProjectToolDefinitions()
	}
	return append(remote, LocalDefinitions()...)
}

func LocalDefinitions() []ai.ProjectToolDefinition {
	return []ai.ProjectToolDefinition{
		{
			Type: "function",
			Function: ai.ProjectToolFunction{
				Name:        WriteFileTool,
				Description: "Create or replace a file inside the workspace. Provide the complete file content. The user approves the write before it happens.",
				Parameters: objectSchema(map[string]any{
					"path":    stringProperty("Workspace-relative file path."),
					"content": stringProperty("Complete file content to write."),
				}, "path", "content"),
			},
		},
		{
			Type: "function",
			Function: ai.ProjectToolFunction{
				Name:        CreateDirectoryTool,
				Description: "Create a folder inside the workspace. The user approves the folder before it is created.",
				Parameters: objectSchema(map[string]any{
					"path": stringProperty("Workspace-relative folder path."),
				}, "path"),
			},
		},
		{
			Type: "function",
			Function: ai.ProjectToolFunction{
				Name:        RunCommandTool,
				Description: "Run a shell command inside the workspace. Provide a short description of why it runs; both appear on the approval card.",
				Parameters: objectSchema(map[string]any{
					"command":     stringProperty("Exact shell command to run."),
					"description": stringProperty("Short reason the command is needed."),
					"cwd":         stringProperty("Optional workspace-relative working directory."),
				}, "command", "description"),
			},
		},
	}
}

func NeedsApproval(name string) bool {
	switch name {
	case WriteFileTool, CreateDirectoryTool, RunCommandTool:
		return true
	default:
		return false
	}
}

func IsWorkspaceTool(name string) bool {
	switch name {
	case "list_files", "glob", "grep", "read_file", "search_project":
		return true
	default:
		return false
	}
}

func fetchWorkspaceDefinitions(
	ctx context.Context,
	port string,
) []ai.ProjectToolDefinition {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		coreproc.CoreURL(port, "/ai/tool-definitions"),
		nil,
	)
	if err != nil {
		return nil
	}
	coreproc.AuthorizeCoreRequest(request)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil
	}

	var envelope struct {
		Status string                     `json:"status"`
		Data   []ai.ProjectToolDefinition `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		return nil
	}
	if strings.TrimSpace(envelope.Status) != "success" {
		return nil
	}
	return envelope.Data
}

func objectSchema(properties map[string]any, required ...string) map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": properties,
		"required":   required,
	}
}

func stringProperty(description string) map[string]any {
	return map[string]any{
		"type":        "string",
		"description": description,
	}
}
