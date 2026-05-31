// Handles terminal resize messages from the frontend.
// xterm.js sends a JSON resize event when the terminal dimensions change
// and we forward that to the PTY so the shell knows the new size.
package terminal

import (
	"encoding/json"
	"log"
	"os"

	"github.com/creack/pty"
)

type resizeMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// handleResize parses a resize message and updates the PTY window size.
// It returns true only when the payload was an Axon resize command.
//
// The websocket carries both terminal keystrokes and control messages. A user
// can type a literal "{" in the shell, so callers must not treat every JSON-
// looking payload as control data. Returning false lets non-resize input fall
// through to the PTY instead of being silently swallowed.
func handleResize(ptmx *os.File, data []byte) bool {
	var msg resizeMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return false
	}
	if msg.Type != "resize" {
		return false
	}
	if err := pty.Setsize(ptmx, &pty.Winsize{
		Cols: msg.Cols,
		Rows: msg.Rows,
	}); err != nil {
		log.Println("pty resize error:", err)
	}
	return true
}
