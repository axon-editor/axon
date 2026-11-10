// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package markdown

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/glamour/ansi"
	"github.com/charmbracelet/glamour/styles"
)

// Renderer owns one glamour instance per width. Rebuilding it on every delta
// would re-parse the style config and allocate word-wrapping state for each
// token, so the TUI keeps it alive until the terminal is resized.
type Renderer struct {
	renderer *glamour.TermRenderer
}

func New(width int) *Renderer {
	renderer, err := glamour.NewTermRenderer(
		glamour.WithStyles(style()),
		glamour.WithWordWrap(max(12, width)),
	)
	// A style error is a programming mistake, not a user-facing failure.
	// Falling back to plain text keeps the answer readable instead of dropping
	// the whole transcript.
	if err != nil {
		return &Renderer{}
	}
	return &Renderer{renderer: renderer}
}

func (r *Renderer) Render(content string) string {
	content = strings.TrimSpace(surface.Sanitize(content))
	if content == "" {
		return ""
	}
	if r.renderer == nil {
		return content
	}
	rendered, err := r.renderer.Render(content)
	if err != nil {
		return content
	}
	return strings.TrimRight(rendered, "\n")
}

func style() ansi.StyleConfig {
	config := styles.DarkStyleConfig

	config.Document.Margin = uintPtr(0)
	config.Document.BlockPrefix = ""
	config.Document.BlockSuffix = ""
	config.Document.Color = stringPtr(theme.HexText)

	config.BlockQuote.Indent = uintPtr(1)
	config.BlockQuote.IndentToken = stringPtr("│ ")
	config.BlockQuote.Color = stringPtr(theme.HexTeal)

	config.Heading.Color = stringPtr(theme.HexCyan)
	config.H1.Prefix = ""
	config.H1.Suffix = ""
	config.H1.BackgroundColor = nil
	config.H1.Color = stringPtr(theme.HexCyan)
	config.H2.Color = stringPtr(theme.HexTeal)
	config.H3.Color = stringPtr(theme.HexTeal)
	config.H4.Color = stringPtr(theme.HexMuted)
	config.H5.Color = stringPtr(theme.HexMuted)
	config.H6.Color = stringPtr(theme.HexMuted)

	config.Strong.Color = stringPtr(theme.HexBright)
	config.Emph.Italic = boolPtr(true)
	config.Link.Color = stringPtr(theme.HexCyan)
	config.LinkText.Color = stringPtr(theme.HexTeal)

	config.Code.Prefix = " "
	config.Code.Suffix = " "
	config.Code.Color = stringPtr(theme.HexGreen)
	config.Code.BackgroundColor = stringPtr(theme.HexInlineSurface)

	config.CodeBlock.Margin = uintPtr(0)
	config.CodeBlock.BackgroundColor = stringPtr(theme.HexCodeSurface)
	config.CodeBlock.Color = stringPtr(theme.HexText)
	if config.CodeBlock.Chroma != nil {
		chroma := *config.CodeBlock.Chroma
		chroma.Background = ansi.StylePrimitive{
			BackgroundColor: stringPtr(theme.HexCodeSurface),
		}
		config.CodeBlock.Chroma = &chroma
	}

	return config
}

func stringPtr(value string) *string {
	return &value
}

func uintPtr(value uint) *uint {
	return &value
}

func boolPtr(value bool) *bool {
	return &value
}
