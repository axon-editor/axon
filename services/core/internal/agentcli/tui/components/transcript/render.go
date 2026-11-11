// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/markdown"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

const (
	toolPreviewLines  = 6
	expandedToolLines = 200
)

type Renderer struct {
	width     int
	workspace string
	markdown  *markdown.Renderer
	cache     map[string]string
	positions map[string]int
}

func New() *Renderer {
	return &Renderer{
		cache:     make(map[string]string),
		positions: make(map[string]int),
	}
}

// OffsetFor returns the start line of a message in the last rendered layout.
func (r *Renderer) OffsetFor(id string) (int, bool) {
	offset, ok := r.positions[id]
	return offset, ok
}

// SetWorkspace lets tool cards shorten absolute paths back to the project.
func (r *Renderer) SetWorkspace(workspace string) {
	if workspace == r.workspace {
		return
	}
	r.workspace = workspace
	clear(r.cache)
}

// SetWidth rebuilds the markdown wrap width. Every cached block is discarded
// because line wrapping changes the whole surface.
func (r *Renderer) SetWidth(width int) {
	width = max(24, width)
	if width == r.width && r.markdown != nil {
		return
	}
	r.width = width
	r.markdown = markdown.New(width)
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
	r.positions = make(map[string]int, len(messages))
	line := 0
	for index, message := range messages {
		key := cacheKey(message, index == active)
		seen[key] = struct{}{}
		rendered, ok := r.cache[key]
		if !ok {
			rendered = r.render(message, width, index == active)
			r.cache[key] = rendered
		}
		if message.ID != "" {
			r.positions[message.ID] = line
		}
		blocks = append(blocks, rendered)
		line += strings.Count(rendered, "\n") + 2
	}
	for key := range r.cache {
		if _, ok := seen[key]; !ok {
			delete(r.cache, key)
		}
	}

	return strings.Join(blocks, "\n\n")
}

func (r *Renderer) render(message components.Message, width int, active bool) string {
	if message.Tool != nil {
		return renderTool(message.Tool, width, r.workspace)
	}
	if message.Thinking {
		return renderThought(message, width)
	}
	if message.Role == "user" {
		return renderUser(message.Content, width)
	}
	return renderAssistant(message.Content, width, active, r.markdown)
}

func renderUser(content string, width int) string {
	// User turns are the one place with a surface. Keeping the background only
	// here distinguishes the speaker without turning every answer into a panel.
	body := lipgloss.NewStyle().Width(max(20, width-4)).Render(content)
	lines := strings.Split(body, "\n")
	for index := range lines {
		lines[index] = surface.TrimTrailing(lines[index])
		if index == 0 {
			lines[index] = theme.Prompt.Render("Λ") + " " + lines[index]
		} else {
			lines[index] = "  " + lines[index]
		}
	}
	return strings.Join(surface.Block(lines, width, theme.UserSurface), "\n")
}

func renderAssistant(
	content string,
	width int,
	active bool,
	renderer *markdown.Renderer,
) string {
	lines := splitContent(renderer.Render(content))
	for index := range lines {
		lines[index] = surface.TrimTrailing(lines[index])
	}
	if active {
		cursor := theme.Cursor.Render("▍")
		if len(lines) == 0 {
			lines = []string{cursor}
		} else {
			lines[len(lines)-1] += cursor
		}
	}
	return strings.Join(lines, "\n")
}

func renderThought(message components.Message, width int) string {
	header := theme.ThinkingHead.Render(thoughtHeader(message.Collapsed))
	if message.Collapsed && message.Content != "" {
		// A collapsed block with no text looks like an empty artifact. Keep a
		// one-line preview and the shortcut visible so the reasoning is
		// discoverable without expanding every thought by default.
		header += theme.ToolMeta.Render(
			"  " + thoughtPreview(message.Content) + "  · ctrl+t",
		)
	}
	lines := []string{header}
	if !message.Collapsed && message.Content != "" {
		body := theme.Thinking.Width(max(20, width-2)).Render(message.Content)
		for _, line := range strings.Split(body, "\n") {
			lines = append(lines, "  "+surface.TrimTrailing(line))
		}
	}
	return strings.Join(lines, "\n")
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

func thoughtPreview(content string) string {
	content = strings.TrimSpace(surface.Sanitize(content))
	if content == "" {
		return ""
	}
	line := content
	if index := strings.IndexByte(line, '\n'); index >= 0 {
		line = line[:index]
	}
	line = strings.Join(strings.Fields(line), " ")
	return truncateValue(line, 64)
}

func renderTool(tool *components.Tool, width int, workspace string) string {
	lines := []string{ansi.Truncate(toolHeader(tool, workspace), width, "…")}
	if meta := toolMeta(tool); meta != "" {
		lines = append(lines, "  "+theme.ToolMeta.Render(meta))
	}

	preview, hidden := toolPreview(tool)
	for _, line := range preview {
		line = ansi.Truncate(line, max(20, width-2), "…")
		lines = append(lines, "  "+theme.ToolResult.Render(line))
	}
	if hidden > 0 {
		hint := fmt.Sprintf("… %d more lines · ctrl+o", hidden)
		if tool.Expanded {
			hint = fmt.Sprintf("… %d more lines remaining", hidden)
		}
		lines = append(lines, "  "+theme.ToolMeta.Render(hint))
	}
	return strings.Join(lines, "\n")
}

func toolHeader(tool *components.Tool, workspace string) string {
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
	if summary := toolSummary(tool.Name, tool.Arguments, workspace); summary != "" {
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
	case "turn", "session":
		parts = append(parts, "allowed for session")
	case "denied":
		parts = append(parts, "denied")
	}
	if !tool.OK && tool.Approval != "denied" {
		parts = append(parts, "failed")
	}
	return strings.Join(parts, " · ")
}

func toolSummary(name, rawArguments, workspace string) string {
	rawArguments = strings.TrimSpace(rawArguments)
	if rawArguments == "" || rawArguments == "{}" {
		return ""
	}

	var args struct {
		Path    string `json:"path"`
		Pattern string `json:"pattern"`
		Query   string `json:"query"`
		Command string `json:"command"`
		Workdir string `json:"workdir"`
		From    string `json:"from"`
		To      string `json:"to"`
		Offset  int    `json:"offset"`
		Limit   int    `json:"limit"`
		Depth   int    `json:"depth"`
	}
	if err := json.Unmarshal([]byte(rawArguments), &args); err != nil {
		return truncateValue(surface.Sanitize(rawArguments), 80)
	}
	switch name {
	case "read", "read_file":
		summary := displayPath(workspace, args.Path)
		if args.Offset > 0 {
			summary += fmt.Sprintf(" · from %d", args.Offset)
		}
		if args.Limit > 0 {
			summary += fmt.Sprintf(" · %d lines", args.Limit)
		}
		return surface.Sanitize(summary)
	case "list", "list_files":
		summary := displayPath(workspace, args.Path)
		if summary == "" {
			summary = "workspace"
		}
		if args.Depth > 0 {
			summary += fmt.Sprintf(" · depth %d", args.Depth)
		}
		return surface.Sanitize(summary)
	case "glob":
		return surface.Sanitize(displayPath(workspace, firstNonEmpty(args.Pattern, args.Path)))
	case "grep", "search_project":
		return surface.Sanitize(firstNonEmpty(args.Query, args.Pattern))
	case "shell", "run_command":
		summary := args.Command
		if workdir := displayPath(workspace, args.Workdir); workdir != "" && workdir != "." {
			summary += " · " + workdir
		}
		return surface.Sanitize(summary)
	case "write", "write_file", "create_directory", "delete", "remove":
		return surface.Sanitize(displayPath(workspace, args.Path))
	case "move", "rename":
		summary := displayPath(workspace, args.From)
		if to := displayPath(workspace, args.To); to != "" {
			summary += " → " + to
		}
		return surface.Sanitize(summary)
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
	limit := toolPreviewLines
	if tool.Expanded {
		limit = expandedToolLines
	}
	if len(lines) <= limit {
		return lines, 0
	}
	hidden := len(lines) - limit
	// Build and test output puts the actionable error at the end, so command
	// cards keep the tail while file reads keep the beginning.
	if tool.Name == "run_command" || tool.Name == "shell" {
		return lines[hidden:], hidden
	}
	return lines[:limit], hidden
}

func displayPath(workspace, value string) string {
	value = strings.TrimSpace(value)
	if value == "" || workspace == "" {
		return value
	}
	root := filepath.Clean(workspace)
	target := filepath.Clean(value)
	if target == root {
		return "."
	}
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." ||
		strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return value
	}
	return relative
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
			"%s|%s|%t|%t|%t|%s|%t|%d|%d|%d",
			message.Tool.CallID,
			message.Tool.Name,
			message.Tool.Running,
			message.Tool.Waiting,
			message.Tool.OK,
			message.Tool.Approval,
			message.Tool.Expanded,
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
