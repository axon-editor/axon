// Handles PTY (pseudo terminal) creation and WebSocket bridging.
// When a client connects via WebSocket, a real shell process is spawned
// attached to a PTY. All input from the WebSocket is written to the PTY,
// all output from the PTY is written back to the WebSocket.
// This gives the frontend a real interactive shell via xterm.js.
package terminal

import (
	"io"
	"log"
	"os"
	"os/exec"

	"github.com/creack/pty"
	"golang.org/x/net/websocket"
)

// Handler is the WebSocket handler for the terminal endpoint.
// Each connection gets its own shell process and PTY pair.
// The shell is determined by the SHELL env var, falling back to /bin/bash.
func Handler(ws *websocket.Conn) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}

	cmd := exec.Command(shell)

	// inherit the current environment so PATH, HOME, etc are all available
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

	// copy PTY output to WebSocket — shell stdout goes to the browser
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
			if err := websocket.Message.Send(ws, string(buf[:n])); err != nil {
				return
			}
		}
	}()

	// copy WebSocket input to PTY — keystrokes from xterm.js go to the shell
	buf := make([]byte, 4096)
	for {
		n, err := ws.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Println("ws read error:", err)
			}
			return
		}

		// check if this is a resize message — JSON like {"type":"resize","cols":80,"rows":24}
		// otherwise treat as raw shell input
		data := buf[:n]
		if len(data) > 0 && data[0] == '{' {
			handleResize(ptmx, data)
			continue
		}

		if _, err := ptmx.Write(data); err != nil {
			return
		}
	}
}
