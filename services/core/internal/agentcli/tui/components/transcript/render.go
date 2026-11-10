// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/markdown"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
)

const toolPreviewLines = 6

type Renderer struct {
	width    int
	markdown *markdown.Renderer
	cache    map[string]string
}

func New() *Renderer {
	return &Renderer{cache: make(map[string]string)}
}

// SetWidth rebuilds the markdown wrap width. Every cached block is discarded
// because line wrapping changes the whole surface.
func (r *Renderer) SetWidth(width int) {
	width = max(24, width)
	if width == r.width && r.markdown != nil {
		return
	}
	r.width = width
	r.markdown = markdown.New(width - surface.PaddingX*2)
	clear(r.cache)
}

// Render joins the transcript blocks. Only the active message changes while a
// turn streams, so caching every other block keeps long conversations cheap to
// redraw instead of re-parsing the whole markdown history on each delta.
func (r *Renderer) Render(messages []components.Message, active int) string {
	if r.markdown == nil {
		r.SetWidth(r.width)
	}
	width := max(24, r.width)

	blocks := make([]string, 0, len(messages))
	seen := make(map[string]struct{}, len(messages))
	for index, message := range messages {
		key := cacheKey(message, index == active)
		seen[key] = struct{}{}
		if cached, ok := r.cache[key]; ok {
			blocks = append(blocks, cached)
			continue
		}
		rendered := r.render(message, width, index == active)
		r.cache[key] = rendered
		blocks = append(blocks, rendered)
	}
	for key := range r.cache {
		if _, ok := seen[key]; !ok {
			delete(r.cache, key)
		}
	}

	return strings.Join(blocks, "\n\n")
}

func (r *Renderer) render(message components.Message, width int, active bool) string {
	inner := width - surface.PaddingX*2

	if message.Tool != nil {
		return renderTool(message.Tool, width)
	}

	if message.Thinking {
		lines := []string{theme.ThinkingHead.Render(thoughtHeader(message.Collapsed))}
		if !message.Collapsed && message.Content != "" {
			body := theme.Thinking.Width(inner).Render(message.Content)
			lines = append(lines, strings.Split(body, "\n")...)
		}
		return strings.Join(surface.Block(lines, width, theme.ThoughtSurface), "\n")
	}

	lines := splitContent(r.markdown.Render(message.Content))
	for index := range lines {
		lines[index] = surface.TrimTrailing(lines[index])
	}
	if active && message.Role == "assistant" {
		cursor := theme.Cursor.Render("▍")
		if len(lines) == 0 {
			lines = []string{cursor}
		} else {
			lines[len(lines)-1] += cursor
		}
	}

	background := theme.ModelSurface
	if message.Role == "user" {
		background = theme.UserSurface
	}
	return strings.Join(surface.Block(lines, width, background), "\n")
}

func splitContent(content string) []string {
	if content == "" {
		return nil
	}
	return strings.Split(content, "\n")
}

func thoughtHeader(collapsed bool) string {
	if collapsed {
		return "▸ Thought"
	}
	return "▾ Thinking"
}

func renderTool(tool *components.Tool, width int) string {
	lines := []string{toolHeader(tool)}
	if meta := toolMeta(tool); meta != "" {
		lines = append(lines, theme.ToolMeta.Render(meta))
	}

	preview, hidden := toolPreview(tool)
	for _, line := range preview {
		lines = append(lines, theme.ToolResult.Render(line))
	}
	if hidden > 0 {
		lines = append(lines, theme.ToolMeta.Render(fmt.Sprintf("… %d more lines", hidden)))
	}

	return strings.Join(surface.Block(lines, width, theme.ToolSurface), "\n")
}

func toolHeader(tool *components.Tool) string {
	icon := theme.ToolActive.Render("▸")
	switch {
	case tool.Waiting:
		icon = theme.ToolActive.Render("?")
	case tool.Running:
		icon = theme.ToolActive.Render("▸")
	case tool.OK:
		icon = theme.ToolOK.Render("✓")
	default:
		icon = theme.ToolError.Render("✗")
	}

	name := strings.TrimSpace(surface.Sanitize(tool.Name))
	if name == "" {
		name = "tool"
	}
	header := icon + " " + theme.ToolName.Render(name)
	if summary := toolSummary(tool.Name, tool.Arguments); summary != "" {
		header += "  " + theme.ToolMeta.Render(summary)
	}
	return header
}

func toolMeta(tool *components.Tool) string {
	if tool.Waiting {
		return "waiting for approval"
	}
	if tool.Running {
		return "running"
	}

	parts := make([]string, 0, 4)
	if tool.DurationMS > 0 {
		parts = append(parts, fmt.Sprintf("%dms", tool.DurationMS))
	}
	if lines := resultLineCount(tool.Result); lines > 0 {
		label := "lines"
		if lines == 1 {
			label = "line"
		}
		parts = append(parts, fmt.Sprintf("%d %s", lines, label))
	}
	switch tool.Approval {
	case "once":
		parts = append(parts, "approved once")
	case "turn":
		parts = append(parts, "allowed for run")
	case "denied":
		parts = append(parts, "denied")
	}
	if !tool.OK && tool.Approval != "denied" {
		parts = append(parts, "failed")
	}
	return strings.Join(parts, " · ")
}

func toolSummary(name, rawArguments string) string {
	rawArguments = strings.TrimSpace(rawArguments)
	if rawArguments == "" || rawArguments == "{}" {
		return ""
	}

	var args struct {
		Path    string `json:"path"`
		Pattern string `json:"pattern"`
		Query   string `json:"query"`
		Command string `json:"command"`
		Offset  int    `json:"offset"`
		Limit   int    `json:"limit"`
		Depth   int    `json:"depth"`
	}
	if err := json.Unmarshal([]byte(rawArguments), &args); err != nil {
		return truncateValue(surface.Sanitize(rawArguments), 80)
	}

	switch name {
	case "read_file":
		summary := args.Path
		if args.Offset > 0 {
			summary += fmt.Sprintf(" · from %d", args.Offset)
		}
		if args.Limit > 0 {
			summary += fmt.Sprintf(" · %d lines", args.Limit)
		}
		return surface.Sanitize(summary)
	case "list_files":
		summary := args.Path
		if summary == "" {
			summary = "workspace"
		}
		if args.Depth > 0 {
			summary += fmt.Sprintf(" · depth %d", args.Depth)
		}
		return surface.Sanitize(summary)
	case "glob":
		return surface.Sanitize(firstNonEmpty(args.Pattern, args.Path))
	case "grep":
		return surface.Sanitize(args.Query)
	case "run_command":
		return surface.Sanitize(args.Command)
	case "write_file", "create_directory":
		return surface.Sanitize(args.Path)
	default:
		var compact bytes.Buffer
		if err := json.Compact(&compact, []byte(rawArguments)); err != nil {
			return truncateValue(surface.Sanitize(rawArguments), 80)
		}
		return truncateValue(surface.Sanitize(compact.String()), 80)
	}
}

func toolPreview(tool *components.Tool) ([]string, int) {
	result := strings.TrimRight(surface.Sanitize(tool.Result), "\n")
	if strings.TrimSpace(result) == "" {
		return nil, 0
	}

	lines := strings.Split(result, "\n")
	if len(lines) <= toolPreviewLines {
		return lines, 0
	}
	hidden := len(lines) - toolPreviewLines
	// Build and test output puts the actionable error at the end, so command
	// cards keep the tail while file reads keep the beginning.
	if tool.Name == "run_command" {
		return lines[hidden:], hidden
	}
	return lines[:toolPreviewLines], hidden
}

func resultLineCount(result string) int {
	result = strings.TrimSpace(result)
	if result == "" {
		return 0
	}
	return len(strings.Split(result, "\n"))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func truncateValue(value string, width int) string {
	runes := []rune(value)
	if len(runes) <= width {
		return value
	}
	return string(runes[:width-1]) + "…"
}

func cacheKey(message components.Message, active bool) string {
	toolKey := ""
	if message.Tool != nil {
		toolKey = fmt.Sprintf(
			"%s|%s|%t|%t|%t|%s|%d|%d|%d",
			message.Tool.CallID,
			message.Tool.Name,
			message.Tool.Running,
			message.Tool.Waiting,
			message.Tool.OK,
			message.Tool.Approval,
			len(message.Tool.Arguments),
			len(message.Tool.Result),
			message.Tool.DurationMS,
		)
	}
	// Content only grows during a turn, so length plus state is enough to
	// invalidate the block without hashing the full answer on every delta.
	return fmt.Sprintf(
		"%s|%s|%d|%t|%t|%t|%s",
		message.ID,
		message.Role,
		len(message.Content),
		message.Thinking,
		message.Collapsed,
		active,
		toolKey,
	)
}
