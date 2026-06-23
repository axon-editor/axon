//go:build unix

package agentcli

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
	"golang.org/x/sys/unix"
)

func readAgentPrompt() (string, error) {
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
	renderedLines := 0
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
		case '\r', '\n':
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
			fmt.Fprint(os.Stdout, "\r\n")
			return strings.TrimSpace(string(buffer)), nil
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
				if len(promptSuggestions(string(buffer))) > 0 && selectedSuggestion > 0 {
					selectedSuggestion--
				}
				render()
			case "down":
				suggestions := promptSuggestions(string(buffer))
				if len(suggestions) > 0 && selectedSuggestion < len(suggestions)-1 {
					selectedSuggestion++
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
			buffer = append(buffer[:cursor], append([]rune{rune(key)}, buffer[cursor:]...)...)
			cursor++
			render()
		}
	}
}

func readLinePrompt() (string, error) {
	fmt.Fprint(os.Stdout, interactivePromptLine)
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

func renderAgentPromptWithNotice(output io.Writer, value []rune, cursor int, selectedSuggestion int, notice string, previousLines int) int {
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
	// The input surface is intentionally capped below the full terminal width.
	// Long prompt chrome wrapping is what made the previous version look broken
	// in wide terminals. Keeping a fixed upper bound gives Axon a cleaner CLI
	// shape and makes redraw math predictable.
	width := terminalPromptWidth()
	if width < 40 {
		width = 40
	}
	if width > 88 {
		width = 88
	}
	innerWidth := width - len(interactivePromptTitle) - 6
	if innerWidth < 20 {
		innerWidth = 20
	}

	var lines bytes.Buffer
	lines.WriteString(accent(interactivePromptTitle))
	lines.WriteString("  ")
	lines.WriteString(inputSurface(" " + renderPromptInput(value, cursor, innerWidth) + " "))
	lines.WriteString("\r\n")

	if len(suggestions) > 0 {
		// The first match is treated as the active row. Enter accepts it, so the
		// color is not decoration; it communicates the command that will run if
		// the user submits the current partial slash command.
		visible := suggestions
		if len(visible) > maxPromptSuggestions {
			visible = visible[:maxPromptSuggestions]
		}
		for index, command := range visible {
			row := "  /" + command.Name + "  " + clipPromptLine(command.Summary, width-8-len(command.Name))
			if index == selectedSuggestion {
				lines.WriteString(activeRow(padPromptLine(row, width)))
				lines.WriteString("\r\n")
				continue
			}
			lines.WriteString(muted("  /"))
			lines.WriteString(command.Name)
			lines.WriteString(muted("  "))
			lines.WriteString(muted(clipPromptLine(command.Summary, width-8-len(command.Name))))
			lines.WriteString("\r\n")
		}
		lines.WriteString(dim("  ↑/↓ selects. Enter runs highlighted command. Ctrl-D exits."))
		lines.WriteString("\r\n")
	}
	if strings.TrimSpace(notice) != "" {
		lines.WriteString("  ")
		lines.WriteString(notice)
		lines.WriteString("\r\n")
	}

	_, _ = output.Write(lines.Bytes())
	rendered := 1
	if len(suggestions) > 0 {
		visible := len(suggestions)
		if visible > maxPromptSuggestions {
			visible = maxPromptSuggestions
		}
		rendered += visible + 1
	}
	if strings.TrimSpace(notice) != "" {
		rendered++
	}
	return rendered
}

func renderPromptInput(value []rune, cursor int, innerWidth int) string {
	if innerWidth < 1 {
		innerWidth = 1
	}

	available := innerWidth - 1
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
		// When the prompt is longer than the visible input, keep the cursor near
		// the middle of the field instead of always anchoring at the start. This
		// matches editor behavior: the text scrolls under the caret while the
		// input component itself stays stable.
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

	visible := value[start:end]
	cursorInWindow := cursor - start
	if cursorInWindow < 0 {
		cursorInWindow = 0
	}
	if cursorInWindow > len(visible) {
		cursorInWindow = len(visible)
	}

	var builder strings.Builder
	for index, r := range visible {
		if index == cursorInWindow {
			builder.WriteRune(promptCursorRune)
		}
		builder.WriteRune(r)
	}
	if cursorInWindow == len(visible) {
		builder.WriteRune(promptCursorRune)
	}

	rendered := []rune(builder.String())
	if len(rendered) < innerWidth {
		rendered = append(rendered, []rune(strings.Repeat(" ", innerWidth-len(rendered)))...)
	}
	if len(rendered) > innerWidth {
		rendered = rendered[:innerWidth]
	}
	return strings.Replace(string(rendered), string(promptCursorRune), blinkingCursor(string(promptCursorRune)), 1)
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

func selectModelPrompt(models []ai.ModelInfo, selectedModel string) (string, bool, error) {
	if !isInteractiveTTY() {
		return selectModelLinePrompt(models, selectedModel)
	}

	fd := int(os.Stdin.Fd())
	oldState, err := unix.IoctlGetTermios(fd, ioctlReadTermios)
	if err != nil {
		return selectModelLinePrompt(models, selectedModel)
	}

	// The picker uses the same raw-mode strategy as the main prompt because model
	// selection should feel like part of the agent shell, not a separate printed
	// report. Arrow keys move the active row and Enter returns the selected Axon
	// model id to the caller, which then persists it for future chat requests.
	rawState := *oldState
	rawState.Lflag &^= unix.ECHO | unix.ICANON | unix.ISIG | unix.IEXTEN
	rawState.Iflag &^= unix.ICRNL | unix.IXON | unix.BRKINT | unix.INPCK | unix.ISTRIP
	rawState.Cflag |= unix.CS8
	rawState.Cc[unix.VMIN] = 1
	rawState.Cc[unix.VTIME] = 0

	if err := unix.IoctlSetTermios(fd, ioctlWriteTermios, &rawState); err != nil {
		return selectModelLinePrompt(models, selectedModel)
	}
	defer func() {
		_ = unix.IoctlSetTermios(fd, ioctlWriteTermios, oldState)
		fmt.Fprint(os.Stdout, "\x1b[?25h")
	}()
	fmt.Fprint(os.Stdout, "\x1b[?25l")

	selectedIndex := selectedModelIndex(models, selectedModel)
	renderedLines := 0
	reader := bufio.NewReader(os.Stdin)
	render := func() {
		renderedLines = renderModelPicker(os.Stdout, models, selectedIndex, selectedModel, renderedLines)
	}
	render()

	for {
		key, err := reader.ReadByte()
		if err != nil {
			return "", false, err
		}

		switch key {
		case '\r', '\n':
			fmt.Fprint(os.Stdout, "\r\n")
			if len(models) == 0 {
				return "", false, nil
			}
			return models[selectedIndex].ID, true, nil
		case 3, 4:
			fmt.Fprint(os.Stdout, "\r\n")
			return "", false, nil
		case 27:
			if next, err := reader.ReadByte(); err == nil && next == '[' {
				if sequence, err := reader.ReadByte(); err == nil {
					switch sequence {
					case 'A':
						if selectedIndex > 0 {
							selectedIndex--
							render()
						}
					case 'B':
						if selectedIndex < len(models)-1 {
							selectedIndex++
							render()
						}
					}
				}
			}
		}
	}
}

func runModelPickerInsidePrompt(reader *bufio.Reader, renderedLines *int) string {
	models, err := loadInstalledModelsForPrompt()
	if err != nil {
		return red(err.Error())
	}
	if len(models) == 0 {
		return red("No Axon models are installed locally.")
	}

	selectedModel := defaultModelID()
	selectedIndex := selectedModelIndex(models, selectedModel)
	render := func() {
		*renderedLines = renderInlineModelPicker(os.Stdout, models, selectedIndex, selectedModel, *renderedLines)
	}
	render()

	for {
		key, err := reader.ReadByte()
		if err != nil {
			return red(err.Error())
		}

		switch key {
		case '\r', '\n':
			nextModel := models[selectedIndex].ID
			if err := saveAgentCliConfig(agentCliConfig{SelectedModel: nextModel}); err != nil {
				return red(err.Error())
			}
			return green("Selected " + modelLabel(models, nextModel))
		case 3, 4:
			return dim("Model selection cancelled.")
		case 27:
			if next, err := reader.ReadByte(); err == nil && next == '[' {
				if sequence, err := reader.ReadByte(); err == nil {
					switch sequence {
					case 'A':
						if selectedIndex > 0 {
							selectedIndex--
							render()
						}
					case 'B':
						if selectedIndex < len(models)-1 {
							selectedIndex++
							render()
						}
					}
				}
			}
		}
	}
}

func loadInstalledModelsForPrompt() ([]ai.ModelInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := ai.ListModels(ctx, defaultModelID())
	if err != nil {
		return nil, err
	}
	return installedModels(models), nil
}

func renderInlineModelPicker(output io.Writer, models []ai.ModelInfo, selectedIndex int, selectedModel string, previousLines int) int {
	if previousLines > 0 {
		fmt.Fprintf(output, "\x1b[%dF\x1b[0J", previousLines)
	}

	width := terminalPromptWidth()
	if width < 52 {
		width = 52
	}
	if width > 88 {
		width = 88
	}

	var lines bytes.Buffer
	lines.WriteString(accent(interactivePromptTitle))
	lines.WriteString("  ")
	lines.WriteString(inputSurface(" /model " + strings.Repeat(" ", width-len(interactivePromptTitle)-11)))
	lines.WriteString("\r\n")
	lines.WriteString(dim("  Choose a local Axon model. Use ↑/↓ and Enter. Ctrl-D cancels."))
	lines.WriteString("\r\n")

	for index, model := range models {
		current := ""
		if model.ID == selectedModel {
			current = " " + dim("selected")
		}
		row := fmt.Sprintf("  %s  %s%s", model.Label, green("ready"), current)
		if index == selectedIndex {
			lines.WriteString(activeRow(padPromptLine(row, width)))
			lines.WriteString("\r\n")
			lines.WriteString("  ")
			lines.WriteString(muted(clipPromptLine(model.Description, width-2)))
			lines.WriteString("\r\n")
			continue
		}
		lines.WriteString(row)
		lines.WriteString("\r\n")
	}

	_, _ = output.Write(lines.Bytes())
	return len(models) + 3
}

func renderModelPicker(output io.Writer, models []ai.ModelInfo, selectedIndex int, selectedModel string, previousLines int) int {
	if previousLines > 0 {
		fmt.Fprintf(output, "\x1b[%dF\x1b[0J", previousLines)
	}

	width := terminalPromptWidth()
	if width < 52 {
		width = 52
	}
	if width > 92 {
		width = 92
	}

	var lines bytes.Buffer
	lines.WriteString(accent("Axon models"))
	lines.WriteString(dim("  Use ↑/↓ and Enter. Ctrl-D cancels."))
	lines.WriteString("\r\n")

	for index, model := range models {
		// Only installed models are passed into the picker, but the ready label is
		// still rendered so the list reads like an availability decision instead
		// of a mysterious set of names. Raw runtime model names stay hidden here;
		// users select Axon product names only.
		status := red("missing")
		if model.Available {
			status = green("ready")
		}
		current := ""
		if model.ID == selectedModel {
			current = " " + dim("selected")
		}
		row := fmt.Sprintf("  %s  %s%s", model.Label, status, current)
		if index == selectedIndex {
			lines.WriteString(activeRow(padPromptLine(row, width)))
			lines.WriteString("\r\n")
			lines.WriteString("    ")
			lines.WriteString(muted(clipPromptLine(model.Description, width-4)))
			lines.WriteString("\r\n")
			continue
		}
		lines.WriteString(row)
		lines.WriteString("\r\n")
	}

	_, _ = output.Write(lines.Bytes())
	return len(models) + 2
}

func selectedModelIndex(models []ai.ModelInfo, selectedModel string) int {
	for index, model := range models {
		if model.ID == selectedModel {
			return index
		}
	}
	return 0
}

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
