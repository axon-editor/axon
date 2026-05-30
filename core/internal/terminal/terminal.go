// Handles PTY creation and WebSocket bridging using gorilla/websocket.
// Each connection gets its own shell process and PTY pair.
// Input from the WebSocket is written to the PTY, output from the PTY
// is written back to the WebSocket.
package terminal

import (
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// upgrader configures the WebSocket upgrader.
// CheckOrigin allows all origins since axon-core only runs locally.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Handler upgrades the HTTP connection to WebSocket and spawns a shell.
// Shell is zsh on Mac, falls back to SHELL env var, then /bin/bash.
func Handler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		return
	}
	defer ws.Close()

	// prefer zsh on darwin, fall back to SHELL env, then bash
	shell := "/bin/zsh"
	if _, err := os.Stat(shell); os.IsNotExist(err) {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
	}

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Println("pty start error:", err)
		return
	}
	defer func() {
		ptmx.Close()
		cmd.Process.Kill()
	}()

	// copy PTY output to WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Println("pty read error:", err)
				}
				return
			}
			if err := ws.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
				return
			}
		}
	}()

	// copy WebSocket input to PTY
	for {
		_, data, err := ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Println("ws read error:", err)
			}
			return
		}

		// resize message comes as JSON, raw keystrokes go straight to PTY
		if len(data) > 0 && data[0] == '{' {
			handleResize(ptmx, data)
			continue
		}

		if _, err := ptmx.Write(data); err != nil {
			return
		}
	}
}
