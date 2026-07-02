//go:build unix

package agentcli

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	"github.com/GordenArcher/axon-core/internal/ai"
	"golang.org/x/sys/unix"
)

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
			if err := configstore.Save(configstore.Config{SelectedModel: nextModel}); err != nil {
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

	width := terminalPromptSurfaceWidth()

	var lines bytes.Buffer
	lines.WriteString(inputSurface(padPromptLine("", width)))
	lines.WriteString("\r\n")
	lines.WriteString(inputSurface(padPromptLine("  /model", width)))
	lines.WriteString("\r\n")
	lines.WriteString(inputSurface(padPromptLine("  Choose a local Axon model. Use ↑/↓ and Enter. Ctrl-D cancels.", width)))
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
			lines.WriteString(inputSurface(padPromptLine("  "+clipPromptLine(model.Description, width-2), width)))
			lines.WriteString("\r\n")
			continue
		}
		lines.WriteString(inputSurface(padPromptLine(row, width)))
		lines.WriteString("\r\n")
	}

	_, _ = output.Write(lines.Bytes())
	return len(models) + 4
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
