// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"fmt"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/markdown"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
)

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

func cacheKey(message components.Message, active bool) string {
	// Content only grows during a turn, so length plus state is enough to
	// invalidate the block without hashing the full answer on every delta.
	return fmt.Sprintf(
		"%s|%s|%d|%t|%t|%t",
		message.ID,
		message.Role,
		len(message.Content),
		message.Thinking,
		message.Collapsed,
		active,
	)
}
