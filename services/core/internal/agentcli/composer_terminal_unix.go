//go:build unix

package agentcli

import (
	"bufio"
	"os"
	"strings"

	"golang.org/x/sys/unix"
)

func readPromptEscapeSequence(reader *bufio.Reader) string {
	next, err := reader.ReadByte()
	if err != nil || next != '[' {
		return ""
	}

	sequence, err := reader.ReadByte()
	if err != nil {
		return ""
	}

	switch sequence {
	case 'A':
		return "up"
	case 'B':
		return "down"
	case 'D':
		return "left"
	case 'C':
		return "right"
	case 'H':
		return "home"
	case 'F':
		return "end"
	case '3':
		_, _ = reader.ReadByte()
		return "delete"
	default:
		return ""
	}
}

func terminalPromptWidth() int {
	ws, err := unix.IoctlGetWinsize(int(os.Stdout.Fd()), unix.TIOCGWINSZ)
	if err != nil || ws == nil || ws.Col == 0 {
		return 80
	}
	return int(ws.Col)
}

// terminalPromptSurfaceWidth returns the visible width Axon can safely own for
// its composer surface. The prompt should feel full-width, but terminal emulators
// often wrap when the final printable cell is filled exactly, especially once
// ANSI reset sequences are involved. Reserving one column avoids ghost lines
// without going back to the narrow boxed prompt.
func terminalPromptSurfaceWidth() int {
	width := terminalPromptWidth()
	if width < 52 {
		return 52
	}

	return width - 1
}

func clipPromptLine(text string, limit int) string {
	trimmed := strings.TrimSpace(text)
	if limit <= 0 || len(trimmed) <= limit {
		return trimmed
	}
	if limit <= 1 {
		return trimmed[:1]
	}
	if limit <= 3 {
		return trimmed[:limit]
	}
	return trimmed[:limit-3] + "..."
}
