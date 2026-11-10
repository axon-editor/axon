// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/coreproc"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client/tools/command"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client/tools/workspace"
)

// Result is the text the model sees plus the success state the TUI card shows.
type Result struct {
	Content string
	OK      bool
}

type writeFileArgs struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type createDirectoryArgs struct {
	Path string `json:"path"`
}

type runCommandArgs struct {
	Command     string `json:"command"`
	Description string `json:"description"`
	Cwd         string `json:"cwd"`
}

func Execute(
	ctx context.Context,
	port string,
	folderPath string,
	name string,
	rawArguments json.RawMessage,
) Result {
	switch name {
	case WriteFileTool:
		var args writeFileArgs
		if err := json.Unmarshal(rawArguments, &args); err != nil {
			return Result{Content: "write_file failed: invalid arguments.", OK: false}
		}
		content, ok := workspace.WriteFile(folderPath, args.Path, args.Content)
		return Result{Content: content, OK: ok}
	case CreateDirectoryTool:
		var args createDirectoryArgs
		if err := json.Unmarshal(rawArguments, &args); err != nil {
			return Result{Content: "create_directory failed: invalid arguments.", OK: false}
		}
		content, ok := workspace.CreateDirectory(folderPath, args.Path)
		return Result{Content: content, OK: ok}
	case RunCommandTool:
		var args runCommandArgs
		if err := json.Unmarshal(rawArguments, &args); err != nil {
			return Result{Content: "run_command failed: invalid arguments.", OK: false}
		}
		content, ok := command.Run(ctx, folderPath, args.Command, args.Description, args.Cwd)
		return Result{Content: content, OK: ok}
	default:
		if !IsWorkspaceTool(name) {
			return Result{Content: "Unknown tool: " + name, OK: false}
		}
		content, ok := runWorkspaceTool(ctx, port, folderPath, name, rawArguments)
		return Result{Content: content, OK: ok}
	}
}

// ApprovalDetails returns the summary and modal body for a mutating tool. The
// content preview is bounded so a large write does not turn the approval card
// into the entire file.
func ApprovalDetails(name string, rawArguments json.RawMessage) (string, string, bool) {
	switch name {
	case WriteFileTool:
		var args writeFileArgs
		if err := json.Unmarshal(rawArguments, &args); err != nil {
			return "write_file", "Invalid write_file arguments.", false
		}
		preview := previewText(args.Content, 24, 2000)
		details := fmt.Sprintf(
			"Write %d bytes to %s\n\n%s",
			len(args.Content),
			fallback(args.Path, "(no path)"),
			preview,
		)
		return args.Path, details, false
	case CreateDirectoryTool:
		var args createDirectoryArgs
		if err := json.Unmarshal(rawArguments, &args); err != nil {
			return "create_directory", "Invalid create_directory arguments.", false
		}
		return args.Path, "Create directory:\n\n" + fallback(args.Path, "(no path)"), false
	case RunCommandTool:
		var args runCommandArgs
		if err := json.Unmarshal(rawArguments, &args); err != nil {
			return "run_command", "Invalid run_command arguments.", false
		}
		details := fallback(args.Description, "(no description)") + "\n\n$ " + args.Command
		if strings.TrimSpace(args.Cwd) != "" {
			details += "\n\ncwd: " + args.Cwd
		}
		return args.Command, details, true
	default:
		return name, "", false
	}
}

func runWorkspaceTool(
	ctx context.Context,
	port string,
	folderPath string,
	name string,
	rawArguments json.RawMessage,
) (string, bool) {
	payload, err := json.Marshal(map[string]any{
		"folderPath": folderPath,
		"name":       name,
		"arguments":  rawArguments,
	})
	if err != nil {
		return name + " failed: " + err.Error(), false
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		coreproc.CoreURL(port, "/ai/run-tool"),
		bytes.NewReader(payload),
	)
	if err != nil {
		return name + " failed: " + err.Error(), false
	}
	request.Header.Set("Content-Type", "application/json")
	coreproc.AuthorizeCoreRequest(request)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return name + " failed: " + err.Error(), false
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return name + " failed: core returned " + response.Status, false
	}

	var envelope struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		Data    struct {
			Result string `json:"result"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		return name + " failed: " + err.Error(), false
	}
	if envelope.Status != "success" {
		return name + " failed: " + fallback(envelope.Message, "unknown error"), false
	}
	return envelope.Data.Result, toolResultOK(envelope.Data.Result)
}

func toolResultOK(result string) bool {
	normalized := strings.ToLower(result)
	return !strings.Contains(normalized, " failed:") &&
		!strings.HasPrefix(normalized, "unknown ")
}

func previewText(content string, maxLines, maxBytes int) string {
	if len(content) > maxBytes {
		content = content[:maxBytes]
	}
	lines := strings.Split(content, "\n")
	truncated := false
	if len(lines) > maxLines {
		lines = lines[:maxLines]
		truncated = true
	}
	result := strings.Join(lines, "\n")
	if truncated {
		result += "\n…"
	}
	return result
}

func fallback(value, fallbackValue string) string {
	if strings.TrimSpace(value) == "" {
		return fallbackValue
	}
	return value
}
