//go:build unix

package agentcli

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"time"

	"golang.org/x/sys/unix"
)

func selectResumeSessionPrompt(sessions []agentSessionRecord) (*agentSessionRecord, bool, error) {
	if !isInteractiveTTY() {
		return nil, false, nil
	}

	fd := int(os.Stdin.Fd())
	oldState, err := unix.IoctlGetTermios(fd, ioctlReadTermios)
	if err != nil {
		return nil, false, nil
	}

	// Resume is part of the terminal agent workflow, so it uses the same
	// raw-mode interaction model as the main composer: one focused surface,
	// arrow-key selection, Enter to open, and Ctrl-D to cancel.
	rawState := *oldState
	rawState.Lflag &^= unix.ECHO | unix.ICANON | unix.ISIG | unix.IEXTEN
	rawState.Iflag &^= unix.ICRNL | unix.IXON | unix.BRKINT | unix.INPCK | unix.ISTRIP
	rawState.Cflag |= unix.CS8
	rawState.Cc[unix.VMIN] = 1
	rawState.Cc[unix.VTIME] = 0

	if err := unix.IoctlSetTermios(fd, ioctlWriteTermios, &rawState); err != nil {
		return nil, false, nil
	}
	defer func() {
		_ = unix.IoctlSetTermios(fd, ioctlWriteTermios, oldState)
		fmt.Fprint(os.Stdout, "\x1b[?25h")
	}()
	fmt.Fprint(os.Stdout, "\x1b[?25l")

	selectedIndex := 0
	renderedLines := 0
	reader := bufio.NewReader(os.Stdin)
	render := func() {
		renderedLines = renderResumeSessionPicker(os.Stdout, sessions, selectedIndex, renderedLines)
	}
	render()

	for {
		key, err := reader.ReadByte()
		if err != nil {
			return nil, false, err
		}
		switch key {
		case '\r', '\n':
			fmt.Fprint(os.Stdout, "\r\n")
			return &sessions[selectedIndex], true, nil
		case 3, 4:
			fmt.Fprint(os.Stdout, "\r\n")
			return nil, false, nil
		case 27:
			if sequence := readPromptEscapeSequence(reader); sequence != "" {
				switch sequence {
				case "up":
					if selectedIndex > 0 {
						selectedIndex--
						render()
					}
				case "down":
					if selectedIndex < len(sessions)-1 {
						selectedIndex++
						render()
					}
				}
			}
		}
	}
}

func renderResumeSessionPicker(output io.Writer, sessions []agentSessionRecord, selectedIndex int, previousLines int) int {
	if previousLines > 0 {
		fmt.Fprintf(output, "\x1b[%dF\x1b[0J", previousLines)
	}

	width := terminalPromptSurfaceWidth()
	var lines bytes.Buffer
	lines.WriteString(inputSurface(padPromptLine("  Resume Axon session", width)))
	lines.WriteString("\r\n")
	lines.WriteString(inputSurface(padPromptLine("  Use ↑/↓ and Enter. Ctrl-D cancels.", width)))
	lines.WriteString("\r\n")

	visible := sessions
	if len(visible) > 8 {
		visible = visible[:8]
	}
	for index, session := range visible {
		updatedAt, _ := time.Parse(time.RFC3339, session.UpdatedAt)
		row := fmt.Sprintf("  %s  %s  %s", session.ID, updatedAt.Format("Jan 02 15:04"), sessionTitle(session.Conversation))
		if index == selectedIndex {
			lines.WriteString(activeRow(padPromptLine(row, width)))
			lines.WriteString("\r\n")
			continue
		}
		lines.WriteString(inputSurface(padPromptLine(row, width)))
		lines.WriteString("\r\n")
	}

	_, _ = output.Write(lines.Bytes())
	return len(visible) + 2
}
