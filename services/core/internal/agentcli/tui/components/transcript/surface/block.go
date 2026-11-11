// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package surface

import (
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

// glamour pads each line to the word-wrap width and emits an empty style span
// for every padding cell. Trimming those cells keeps the output small and, more
// importantly, stops a trailing cursor from being pushed past the block edge.
var emptyStyle = regexp.MustCompile("\x1b\\[[0-9;]*m\x1b\\[0m")

// PaddingX is the breathing room inside a message block. Two columns keeps
// prose away from the terminal edge without wasting room on code.
const PaddingX = 2

// backgroundCache avoids rebuilding the same SGR prefix for every row. The
// active profile is fixed for a process, so the sequence is stable.
var backgroundCache sync.Map

// Block paints lines onto a full-width background. Backgrounds are applied
// after markdown rendering because inner styles reset the terminal background;
// paint re-applies it after every reset so the message reads as one surface.
func Block(lines []string, width int, background lipgloss.Color) []string {
	return BlockAccent(lines, width, background, "")
}

// BlockAccent adds a one-column role rail inside the left padding. The rail is
// applied before the background so every row of the card shares one surface.
func BlockAccent(
	lines []string,
	width int,
	background lipgloss.Color,
	accent lipgloss.Color,
) []string {
	width = max(width, PaddingX*2+1)
	inner := width - PaddingX*2

	rows := make([]string, 0, len(lines)+2)
	rows = append(rows, fill("", inner, background, accent))
	for _, line := range lines {
		rows = append(rows, fill(line, inner, background, accent))
	}
	rows = append(rows, fill("", inner, background, accent))
	return rows
}

// TrimTrailing removes the padding glamour adds while preserving ANSI codes.
// Cutting the styled string at the last visible byte would also drop closing
// hyperlink sequences, so this counts trailing spaces in the stripped text and
// skips exactly those runes.
func TrimTrailing(line string) string {
	plain := ansi.Strip(line)
	trimmed := strings.TrimRight(plain, " ")
	if len(trimmed) == len(plain) {
		return emptyStyle.ReplaceAllString(line, "")
	}

	keep := strings.Count(plain, " ") - (len(plain) - len(trimmed))
	var builder strings.Builder
	builder.Grow(len(line))

	for index := 0; index < len(line); {
		if line[index] == 0x1b {
			index = copyEscape(line, index, &builder)
			continue
		}
		value, size := utf8.DecodeRuneInString(line[index:])
		if value == ' ' {
			if keep <= 0 {
				index += size
				continue
			}
			keep--
		}
		builder.WriteString(line[index : index+size])
		index += size
	}
	return emptyStyle.ReplaceAllString(builder.String(), "")
}

func copyEscape(line string, index int, builder *strings.Builder) int {
	start := index
	if index+1 >= len(line) {
		builder.WriteByte(line[index])
		return index + 1
	}

	switch line[index+1] {
	case '[':
		index += 2
		for index < len(line) {
			value := line[index]
			index++
			if value >= 0x40 && value <= 0x7e {
				break
			}
		}
	case ']':
		index += 2
		for index < len(line) {
			if line[index] == 0x07 {
				index++
				break
			}
			if line[index] == 0x1b &&
				index+1 < len(line) &&
				line[index+1] == '\\' {
				index += 2
				break
			}
			index++
		}
	default:
		index += 2
	}

	builder.WriteString(line[start:index])
	return index
}

func fill(
	line string,
	inner int,
	background lipgloss.Color,
	accent lipgloss.Color,
) string {
	line = ansi.Truncate(TrimTrailing(line), inner, "…")
	padding := inner - lipgloss.Width(line)
	if padding < 0 {
		padding = 0
	}

	prefix := strings.Repeat(" ", PaddingX)
	if accent != "" {
		prefix = lipgloss.NewStyle().Foreground(accent).Render("┃") +
			strings.Repeat(" ", PaddingX-1)
	}
	return paint(
		prefix+
			line+
			strings.Repeat(" ", padding)+
			strings.Repeat(" ", PaddingX),
		background,
	)
}

func paint(line string, background lipgloss.Color) string {
	sequence := backgroundSequence(background)
	if sequence == "" {
		return line
	}
	// Markdown and chroma both end spans with a reset. Without re-injecting the
	// surface colour the message background drops out after the first span.
	line = strings.ReplaceAll(line, "\x1b[0m", "\x1b[0m"+sequence)
	line = strings.ReplaceAll(line, "\x1b[m", "\x1b[m"+sequence)
	return sequence + line + "\x1b[0m"
}

func backgroundSequence(background lipgloss.Color) string {
	if cached, ok := backgroundCache.Load(background); ok {
		return cached.(string)
	}
	probe := lipgloss.NewStyle().Background(background).Render("x")
	index := strings.Index(probe, "x")
	sequence := ""
	if index > 0 {
		sequence = probe[:index]
	}
	backgroundCache.Store(background, sequence)
	return sequence
}
