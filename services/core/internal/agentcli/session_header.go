package agentcli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/terminalui"
)

const terminalSessionTagline = "local-first coding agent for editor-aware work"

func printTerminalSessionHeader(workspace string, session *agentTerminalSession) {
	width := terminalPromptSurfaceWidth()

	model := selectedModelID()
	title := "new conversation"
	if session != nil && session.title != "" {
		title = session.title
	}
	sessionID := ""
	if session != nil {
		sessionID = session.id
	}

	lines := []string{
		" █████╗ ██╗  ██╗ ██████╗ ███╗   ██╗",
		"██╔══██╗╚██╗██╔╝██╔═══██╗████╗  ██║",
		"███████║ ╚███╔╝ ██║   ██║██╔██╗ ██║",
		"██╔══██║ ██╔██╗ ██║   ██║██║╚██╗██║",
		"██║  ██║██╔╝ ██╗╚██████╔╝██║ ╚████║",
		"╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
	}

	fmt.Println()
	for _, line := range lines {
		fmt.Println(centerVisible(brand(line), visibleLength(line), width))
	}
	printAnimatedSessionTagline(width)
	fmt.Println()
	fmt.Println(panelBorder("╭" + strings.Repeat("─", width-2) + "╮"))
	fmt.Println(panelLine("workspace", workspace, width))
	fmt.Println(panelLine("session", sessionID+"  "+title, width))
	fmt.Println(panelLine("model", model, width))
	fmt.Println(panelBorder("├" + strings.Repeat("─", width-2) + "┤"))
	fmt.Println(panelText("Type naturally, or use / for commands. Enter sends. Ctrl-K adds a new line.", width))
	fmt.Println(panelText("/help  /model  /tools  /exit", width))
	fmt.Println(panelBorder("╰" + strings.Repeat("─", width-2) + "╯"))
	fmt.Println(hint("cwd " + compactHomePath(workspace)))
}

func printAnimatedSessionTagline(width int) {
	plain := terminalSessionTagline
	visible := visibleLength(plain)

	if !terminalui.IsTerminalOutput(os.Stdout) {
		fmt.Println(centerVisible(muted(plain), visible, width))
		return
	}

	// The welcome tab animates the Axon word letter-by-letter, so the terminal
	// header uses the same idea without turning startup into a long splash
	// sequence. Each frame briefly lifts one small window of words with the
	// accent color, then leaves a quiet final tagline that reads well in the
	// terminal scrollback.
	words := strings.Fields(plain)
	for index := 0; index < len(words)+2; index++ {
		fmt.Fprint(os.Stdout, "\r\033[2K")
		fmt.Fprint(os.Stdout, centerVisible(renderTaglineFrame(words, index), visible, width))
		time.Sleep(55 * time.Millisecond)
	}
	fmt.Fprint(os.Stdout, "\r\033[2K")
	fmt.Println(centerVisible(muted(plain), visible, width))
}

func renderTaglineFrame(words []string, activeIndex int) string {
	if len(words) == 0 {
		return ""
	}

	rendered := make([]string, len(words))
	for index, word := range words {
		if index == activeIndex || index == activeIndex-1 {
			rendered[index] = accent(word)
			continue
		}
		rendered[index] = muted(word)
	}
	return strings.Join(rendered, " ")
}

func panelLine(label string, value string, width int) string {
	content := fmt.Sprintf(" %-10s %s", label, value)
	return panelText(content, width)
}

func panelText(text string, width int) string {
	innerWidth := width - 4
	if innerWidth < 1 {
		innerWidth = 1
	}
	return panelBorder("│ ") + clipVisible(text, innerWidth) + strings.Repeat(" ", innerWidth-visibleLength(clipVisible(text, innerWidth))) + panelBorder(" │")
}

func centerVisible(text string, visible int, width int) string {
	if visible >= width {
		return text
	}
	left := (width - visible) / 2
	return strings.Repeat(" ", left) + text
}

func clipVisible(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	if limit <= 1 {
		return string(runes[:limit])
	}
	if limit <= 3 {
		return string(runes[:limit])
	}
	return string(runes[:limit-3]) + "..."
}

func visibleLength(text string) int {
	return len([]rune(text))
}

func compactHomePath(pathValue string) string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return pathValue
	}
	relative, err := filepath.Rel(home, pathValue)
	if err != nil || strings.HasPrefix(relative, "..") {
		return pathValue
	}
	if relative == "." {
		return "~"
	}
	return "~" + string(filepath.Separator) + relative
}
