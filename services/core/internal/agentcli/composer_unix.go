//go:build unix

package agentcli

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/prompt"
	"golang.org/x/sys/unix"
)

func readAgentPrompt(history []string) (string, error) {
	if !isInteractiveTTY() {
		return readLinePrompt()
	}

	fd := int(os.Stdin.Fd())
	oldState, err := unix.IoctlGetTermios(fd, ioctlReadTermios)
	if err != nil {
		return readLinePrompt()
	}

	// The prompt needs per-key input so slash commands can filter while the user
	// types and Enter can accept the highlighted command. Canonical terminal mode
	// only returns a full line after Enter, which would make `/mo` impossible to
	// complete into `/model` before command execution.
	rawState := *oldState
	rawState.Lflag &^= unix.ECHO | unix.ICANON | unix.ISIG | unix.IEXTEN
	rawState.Iflag &^= unix.ICRNL | unix.IXON | unix.BRKINT | unix.INPCK | unix.ISTRIP
	rawState.Cflag |= unix.CS8
	rawState.Cc[unix.VMIN] = 1
	rawState.Cc[unix.VTIME] = 0

	if err := unix.IoctlSetTermios(fd, ioctlWriteTermios, &rawState); err != nil {
		return readLinePrompt()
	}
	defer func() {
		_ = unix.IoctlSetTermios(fd, ioctlWriteTermios, oldState)
		fmt.Fprint(os.Stdout, "\x1b[?25h")
		fmt.Fprint(os.Stdout, "\r")
	}()
	fmt.Fprint(os.Stdout, "\x1b[?25l")

	// The buffer is rune-based because prompt editing should not corrupt
	// non-ASCII text. The CLI mostly receives English prompts, but file paths,
	// comments, and user questions can include wider characters, and slicing raw
	// bytes would break cursor movement or backspace in those cases.
	reader := bufio.NewReader(os.Stdin)
	buffer := []rune{}
	cursor := 0
	notice := ""
	selectedSuggestion := 0
	historyIndex := len(history)
	draftBeforeHistory := []rune{}
	renderedLines := 0
	replaceBuffer := func(next []rune) {
		buffer = append(buffer[:0], next...)
		cursor = len(buffer)
		selectedSuggestion = 0
		notice = ""
	}
	render := func() {
		selectedSuggestion = clampSuggestionIndex(promptSuggestions(string(buffer)), selectedSuggestion)
		renderedLines = renderAgentPromptWithNotice(os.Stdout, buffer, cursor, selectedSuggestion, notice, renderedLines)
	}
	render()

	for {
		key, err := reader.ReadByte()
		if err != nil {
			return "", err
		}

		switch key {
		case '\r':
			// Enter is also the command accept key. If the user has typed a
			// unique slash prefix such as `/mo`, the prompt expands it to the
			// highlighted command before returning. That keeps command discovery
			// fast without forcing the user to type the full command name.
			if resolved := resolvePromptSelection(string(buffer), selectedSuggestion); resolved != "" {
				buffer = []rune(resolved)
				cursor = len(buffer)
				render()
			}
			if isModelSlashPrompt(string(buffer)) {
				nextNotice := runModelPickerInsidePrompt(reader, &renderedLines)
				buffer = []rune{}
				cursor = 0
				notice = nextNotice
				render()
				continue
			}
			renderedLines = renderAgentPromptSurface(os.Stdout, buffer, cursor, selectedSuggestion, "", renderedLines, false)
			fmt.Fprint(os.Stdout, "\r\n")
			return strings.TrimSpace(string(buffer)), nil
		case 11:
			// Multiline input uses Ctrl-K because Return is the fast send key in
			// the terminal composer. macOS terminal apps usually reserve true
			// Command-K for clearing the screen/scrollback before the process sees
			// it, so the reliable process-level shortcut is the Ctrl-K byte.
			notice = ""
			selectedSuggestion = 0
			buffer = append(buffer[:cursor], append([]rune{'\n'}, buffer[cursor:]...)...)
			cursor++
			render()
		case 3:
			return "", io.EOF
		case 4:
			if len(buffer) == 0 {
				return "", io.EOF
			}
		case 8, 127:
			notice = ""
			selectedSuggestion = 0
			if cursor > 0 {
				buffer = append(buffer[:cursor-1], buffer[cursor:]...)
				cursor--
			}
			render()
		case 27:
			switch readPromptEscapeSequence(reader) {
			case "up":
				if suggestions := promptSuggestions(string(buffer)); len(suggestions) > 0 {
					selectedSuggestion = (selectedSuggestion - 1 + len(suggestions)) % len(suggestions)
				} else if prompt.HasMultipleLines(buffer) {
					cursor = prompt.MoveCursorVertically(buffer, cursor, -1)
				} else if len(history) > 0 && historyIndex > 0 {
					if historyIndex == len(history) {
						draftBeforeHistory = append([]rune(nil), buffer...)
					}
					historyIndex--
					replaceBuffer([]rune(history[historyIndex]))
				}
				render()
			case "down":
				if suggestions := promptSuggestions(string(buffer)); len(suggestions) > 0 {
					selectedSuggestion = (selectedSuggestion + 1) % len(suggestions)
				} else if prompt.HasMultipleLines(buffer) {
					cursor = prompt.MoveCursorVertically(buffer, cursor, 1)
				} else if len(history) > 0 && historyIndex < len(history) {
					historyIndex++
					if historyIndex == len(history) {
						replaceBuffer(draftBeforeHistory)
					} else {
						replaceBuffer([]rune(history[historyIndex]))
					}
				}
				render()
			case "left":
				if cursor > 0 {
					cursor--
				}
				render()
			case "right":
				if cursor < len(buffer) {
					cursor++
				}
				render()
			case "home":
				cursor = 0
				render()
			case "end":
				cursor = len(buffer)
				render()
			}
		case 1:
			cursor = 0
			render()
		case 5:
			cursor = len(buffer)
			render()
		default:
			if key < 32 {
				continue
			}
			notice = ""
			selectedSuggestion = 0
			historyIndex = len(history)
			buffer = append(buffer[:cursor], append([]rune{rune(key)}, buffer[cursor:]...)...)
			cursor++
			render()
		}
	}
}

func readLinePrompt() (string, error) {
	fmt.Fprint(os.Stdout, prompt.Line)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && len(strings.TrimSpace(line)) == 0 {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func isInteractiveTTY() bool {
	inputInfo, err := os.Stdin.Stat()
	if err != nil || inputInfo.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	outputInfo, err := os.Stdout.Stat()
	if err != nil || outputInfo.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	return true
}

func renderAgentPrompt(output io.Writer, value []rune, cursor int, previousLines int) int {
	return renderAgentPromptWithNotice(output, value, cursor, 0, "", previousLines)
}

// renderAgentPromptWithNotice draws Axon's terminal composer as one owned
// surface instead of printing a normal shell prompt plus a separate helper
// list. Codex and Claude Code feel polished because typed text wraps naturally
// inside one composer surface, command suggestions sit inside the same control,
// and the brand label is not competing with the editable text. This function
// keeps that interaction contract while staying dependency-free in Go.
func renderAgentPromptWithNotice(output io.Writer, value []rune, cursor int, selectedSuggestion int, notice string, previousLines int) int {
	return renderAgentPromptSurface(output, value, cursor, selectedSuggestion, notice, previousLines, true)
}

// renderAgentPromptSurface owns both the live composer and the submitted
// composer snapshot. While editing, `showCaret` is true so the user can see the
// insertion point. When the user submits, Axon redraws the same surface with
// `showCaret` false before starting the stream, which prevents the old input
// box from leaving a fake cursor in the transcript.
func renderAgentPromptSurface(output io.Writer, value []rune, cursor int, selectedSuggestion int, notice string, previousLines int, showCaret bool) int {
	if previousLines > 0 {
		// Each redraw starts from the original input line so the terminal never
		// accumulates stale prompt rows underneath the current textbox. The old
		// content has to be cleared before we print the new state, otherwise every
		// keystroke would leave a longer and longer trail behind and the slash
		// command picker would become unreadable.
		fmt.Fprintf(output, "\x1b[%dF\x1b[0J", previousLines)
	}

	suggestions := promptSuggestions(string(value))
	selectedSuggestion = clampSuggestionIndex(suggestions, selectedSuggestion)
	width := terminalPromptSurfaceWidth()
	innerWidth := width - 6
	if innerWidth < 20 {
		innerWidth = 20
	}

	var lines bytes.Buffer
	lines.WriteString(inputSurface("╭" + strings.Repeat("─", width-2) + "╮"))
	lines.WriteString("\r\n")
	inputLines := renderPromptInputLines(value, cursor, innerWidth, showCaret)
	// The composer height comes from the actual prompt content. Forced blank
	// padding rows looked like separate input boxes, especially before the user
	// typed anything. Keeping only content rows makes multiline input read as
	// one textbox where text flows to the next line.
	for index, inputLine := range inputLines {
		prefix := "> "
		if index > 0 {
			prefix = "  "
		}
		lines.WriteString(composerRow(prefix+inputLine, width, false))
		lines.WriteString("\r\n")
	}

	if len(suggestions) > 0 {
		// The first match is treated as the active row. Enter accepts it, so the
		// color is not decoration; it communicates the command that will run if
		// the user submits the current partial slash command.
		visible := suggestions
		if len(visible) > prompt.MaxSuggestions {
			visible = visible[:prompt.MaxSuggestions]
		}
		lines.WriteString(inputSurface("├" + strings.Repeat("─", width-2) + "┤"))
		lines.WriteString("\r\n")
		for index, command := range visible {
			// The popup rows are padded to the same width as the input row so the
			// whole control feels like one block. If only the command text is
			// colored, the UI falls back to the broken "printed help under a
			// prompt" look that made the earlier version feel unfinished.
			row := formatSlashPickerRow(command, width-4)
			lines.WriteString(composerRow(row, width, index == selectedSuggestion))
			lines.WriteString("\r\n")
		}
		lines.WriteString(composerRow("↑/↓ select  enter accept  esc keep typing", width, false))
		lines.WriteString("\r\n")
	}
	if strings.TrimSpace(notice) != "" {
		lines.WriteString(inputSurface("├" + strings.Repeat("─", width-2) + "┤"))
		lines.WriteString("\r\n")
		lines.WriteString(composerRow(notice, width, false))
		lines.WriteString("\r\n")
	}
	lines.WriteString(inputSurface("╰" + strings.Repeat("─", width-2) + "╯"))
	lines.WriteString("\r\n")
	lines.WriteString(hint(" enter send  ctrl+k newline  / commands  ctrl+d exit"))
	lines.WriteString("\r\n")

	_, _ = output.Write(lines.Bytes())
	rendered := len(inputLines) + 3
	if len(suggestions) > 0 {
		visible := len(suggestions)
		if visible > prompt.MaxSuggestions {
			visible = prompt.MaxSuggestions
		}
		rendered += visible + 2
	}
	if strings.TrimSpace(notice) != "" {
		rendered += 2
	}
	return rendered
}

func composerRow(content string, width int, active bool) string {
	innerWidth := width - 4
	if innerWidth < 1 {
		innerWidth = 1
	}
	clipped := clipPromptLine(content, innerWidth)
	row := "│ " + padPromptLine(clipped, innerWidth) + " │"
	if active {
		return activeRow(row)
	}
	return inputSurface(row)
}

func formatSlashPickerRow(command slashCommandDefinition, width int) string {
	name := "/" + command.Name
	shortcut := strings.TrimSpace(command.Shortcut)
	if shortcut == "" {
		shortcut = "enter"
	}
	nameWidth := 14
	shortcutWidth := 10
	summaryWidth := width - nameWidth - shortcutWidth - 4
	if summaryWidth < 12 {
		summaryWidth = 12
	}
	return padPromptLine(name, nameWidth) +
		clipPromptLine(command.Summary, summaryWidth) +
		"  " +
		clipPromptLine(shortcut, shortcutWidth)
}

// renderPromptInputLines returns the visible rows for the multiline composer.
// The buffer stays as one rune slice so existing editing and history behavior
// remains simple, but rendering splits that buffer into rows and keeps the row
// containing the caret inside a small viewport. Without this viewport, a pasted
// prompt could expand the terminal forever and make the next redraw expensive.
func renderPromptInputLines(value []rune, cursor int, innerWidth int, showCaret bool) []string {
	if innerWidth < 1 {
		innerWidth = 1
	}
	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(value) {
		cursor = len(value)
	}

	rawLines := strings.Split(string(value), "\n")
	if len(rawLines) == 0 {
		rawLines = []string{""}
	}
	lineIndex, column := promptCursorLineAndColumn(value, cursor)
	if lineIndex >= len(rawLines) {
		lineIndex = len(rawLines) - 1
		column = len([]rune(rawLines[lineIndex]))
	}

	start := 0
	if len(rawLines) > prompt.MaxInputRows {
		start = lineIndex - prompt.MaxInputRows/2
		if start < 0 {
			start = 0
		}
		maxStart := len(rawLines) - prompt.MaxInputRows
		if start > maxStart {
			start = maxStart
		}
	}
	end := start + prompt.MaxInputRows
	if end > len(rawLines) {
		end = len(rawLines)
	}

	rendered := make([]string, 0, prompt.MaxInputRows)
	for index := start; index < end; index++ {
		line := []rune(rawLines[index])
		if index == lineIndex {
			rendered = append(rendered, renderPromptLine(line, column, innerWidth, showCaret))
			continue
		}
		rendered = append(rendered, renderPromptLine(line, 0, innerWidth, false))
	}
	return rendered
}

func promptCursorLineAndColumn(value []rune, cursor int) (int, int) {
	line := 0
	column := 0
	for index, char := range value {
		if index >= cursor {
			break
		}
		if char == '\n' {
			line++
			column = 0
			continue
		}
		column++
	}
	return line, column
}

// renderPromptLine returns one visible row and optionally paints the caret at
// the current edit column. Raw terminal mode hides the native cursor while Axon
// owns the composer redraws, so the textbox must provide its own caret or the
// user has no clear typing target.
func renderPromptLine(value []rune, cursor int, innerWidth int, showCaret bool) string {
	if innerWidth < 1 {
		innerWidth = 1
	}

	available := innerWidth
	if available < 1 {
		available = 1
	}

	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(value) {
		cursor = len(value)
	}

	start := 0
	if len(value) > available {
		// When the prompt is longer than the visible input, keep the internal
		// edit position near the middle of the field instead of always anchoring
		// at the start. That keeps the painted caret visible during long prompts
		// while still allowing arrow-key edits and backspace to work normally.
		start = cursor - available/2
		if start < 0 {
			start = 0
		}
		maxStart := len(value) - available
		if start > maxStart {
			start = maxStart
		}
	}
	end := start + available
	if end > len(value) {
		end = len(value)
	}

	rendered := []rune(string(value[start:end]))
	if len(rendered) < innerWidth {
		rendered = append(rendered, []rune(strings.Repeat(" ", innerWidth-len(rendered)))...)
	}
	if len(rendered) > innerWidth {
		rendered = rendered[:innerWidth]
	}
	if !showCaret {
		return string(rendered)
	}

	caretIndex := cursor - start
	if caretIndex < 0 {
		caretIndex = 0
	}
	if caretIndex >= innerWidth {
		caretIndex = innerWidth - 1
	}

	// Use a reversed cell instead of a heavy glyph. It reads as a real terminal
	// caret, works when the input is empty, and avoids adding an extra character
	// that would shift the visible text or break the surface width.
	caretRune := rendered[caretIndex]
	if caretRune == 0 {
		caretRune = ' '
	}
	return string(rendered[:caretIndex]) + promptCaret(string(caretRune)) + string(rendered[caretIndex+1:])
}

func resolvePromptSelection(value string, selectedSuggestion int) string {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "/") {
		return ""
	}

	if suggestions := promptSuggestions(trimmed); len(suggestions) > 0 {
		selectedSuggestion = clampSuggestionIndex(suggestions, selectedSuggestion)
		fields := strings.Fields(strings.TrimPrefix(trimmed, "/"))
		if len(fields) == 0 {
			return "/" + suggestions[selectedSuggestion].Name
		}
		if fields[0] == suggestions[selectedSuggestion].Name {
			return ""
		}
		fields[0] = suggestions[selectedSuggestion].Name
		return "/" + strings.Join(fields, " ")
	}

	fields := strings.Fields(strings.TrimPrefix(trimmed, "/"))
	if len(fields) == 0 {
		return ""
	}

	// Only the first token is the slash command. Arguments after it belong to
	// that command, so `/mo fast` should resolve the command token to `/model`
	// while preserving `fast` for the command handler.
	matches := filterSlashCommands("/" + fields[0])
	if len(matches) != 1 {
		return ""
	}
	if fields[0] == matches[0].Name {
		return ""
	}
	fields[0] = matches[0].Name
	return "/" + strings.Join(fields, " ")
}

func promptSuggestions(value string) []slashCommandDefinition {
	if !strings.HasPrefix(strings.TrimSpace(value), "/") {
		return nil
	}
	return filterSlashCommands(value)
}

func clampSuggestionIndex(suggestions []slashCommandDefinition, selectedIndex int) int {
	if len(suggestions) == 0 || selectedIndex < 0 {
		return 0
	}
	if selectedIndex >= len(suggestions) {
		return len(suggestions) - 1
	}
	return selectedIndex
}

func isModelSlashPrompt(value string) bool {
	fields := strings.Fields(strings.TrimPrefix(strings.TrimSpace(value), "/"))
	if len(fields) == 0 {
		return false
	}
	commandName, ok := resolveSlashCommandName(fields[0])
	return ok && commandName == "model"
}

func padPromptLine(text string, width int) string {
	runes := []rune(text)
	if len(runes) >= width {
		return string(runes[:width])
	}
	return text + strings.Repeat(" ", width-len(runes))
}
