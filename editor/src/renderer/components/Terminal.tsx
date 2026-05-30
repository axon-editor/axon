// Renders an xterm.js terminal connected to the Go PTY backend via WebSocket.
// The terminal panel slides up from the bottom and can be toggled open/closed.
// FitAddon resizes the terminal to fill its container and sends resize
// messages to the PTY backend so the shell always knows the correct dimensions.
import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { X, Minus } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Terminal({ open, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    if (xtermRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0f0f0f",
        foreground: "#e0e0e0",
        cursor: "#6c5ce7",
        cursorAccent: "#0f0f0f",
        selectionBackground: "#6c5ce740",
        black: "#1e1e1e",
        brightBlack: "#3a3a3a",
        red: "#e06c75",
        brightRed: "#e06c75",
        green: "#98c379",
        brightGreen: "#98c379",
        yellow: "#e5c07b",
        brightYellow: "#e5c07b",
        blue: "#61afef",
        brightBlue: "#61afef",
        magenta: "#c678dd",
        brightMagenta: "#c678dd",
        cyan: "#56b6c2",
        brightCyan: "#56b6c2",
        white: "#e0e0e0",
        brightWhite: "#ffffff",
      },
      fontFamily: "'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // connect to the Go PTY backend via WebSocket
    const ws = new WebSocket("ws://localhost:7777/terminal");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);

      // send initial size so the shell starts with correct dimensions
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }),
        );
      }
    };

    ws.onmessage = (e) => {
      term.write(e.data);
    };

    ws.onclose = () => {
      setConnected(false);
      term.write("\r\n\x1b[31mconnection closed\x1b[0m\r\n");
    };

    ws.onerror = () => {
      term.write(
        "\r\n\x1b[31mfailed to connect to terminal backend\x1b[0m\r\n",
      );
    };

    // send keystrokes to the PTY via WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // observe container size changes and resize both xterm and PTY
    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddonRef.current || !wsRef.current) return;
      fitAddonRef.current.fit();
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }),
        );
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [open]);

  // cleanup xterm and WebSocket when terminal is closed
  const handleClose = () => {
    wsRef.current?.close();
    wsRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitAddonRef.current = null;
    setConnected(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="flex flex-col border-t border-[#1f1f1f] bg-[#0f0f0f]"
      style={{ height: "280px" }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f1f1f] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400 font-medium">
            Terminal
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-neutral-600"}`}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClose}
            className="text-neutral-500 hover:text-white transition-colors cursor-pointer p-1"
            title="Close terminal"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden px-2 py-1" />
    </div>
  );
}
