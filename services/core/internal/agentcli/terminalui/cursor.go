package terminalui

import (
	"fmt"
	"os"
	"sync"
)

type CursorState struct {
	active bool
	once   sync.Once
}

func IsTerminalOutput(file *os.File) bool {
	info, err := file.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

// HideCursorDuringStream hides the terminal emulator's native cursor while
// Axon is streaming assistant text. The prompt has its own painted caret, but
// the model response should read like output, not like another editable
// textbox. Restoring happens after the stream so the next prompt can decide
// whether to show its custom caret or the normal terminal cursor.
func HideCursorDuringStream() *CursorState {
	state := &CursorState{active: IsTerminalOutput(os.Stdout)}
	if state.active {
		fmt.Fprint(os.Stdout, "\x1b[?25l")
	}
	return state
}

func (state *CursorState) Restore() {
	state.once.Do(func() {
		if state.active {
			fmt.Fprint(os.Stdout, "\x1b[?25h")
		}
	})
}
