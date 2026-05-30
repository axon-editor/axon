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
// Called when the frontend sends a JSON resize event instead of raw input.
func handleResize(ptmx *os.File, data []byte) {
	var msg resizeMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Println("resize parse error:", err)
		return
	}
	if msg.Type != "resize" {
		return
	}
	if err := pty.Setsize(ptmx, &pty.Winsize{
		Cols: msg.Cols,
		Rows: msg.Rows,
	}); err != nil {
		log.Println("pty resize error:", err)
	}
}
