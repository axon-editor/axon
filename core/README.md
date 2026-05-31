# Axon Core

Go backend for Axon. It owns the HTTP API, file system operations, terminal PTY bridge, and the server-side pieces that the Electron app talks to over IPC or WebSocket.

## What It Does

- Serves the local API on port `7777`
- Reads, writes, and scans project files
- Bridges terminal sessions to a shell process through WebSocket
- Hosts the backend surface for future AI and LSP work

## Layout

```text
core/
├── cmd/axon/        # executable entry point
└── internal/
    ├── server/      # HTTP server and routes
    ├── fs/          # file system helpers
    └── terminal/    # PTY and websocket bridge
```

## Run

```bash
cd core
go run cmd/axon/main.go
```

## Test

```bash
go test ./...
```

## Notes

- The frontend expects this server to be running locally.
- Terminal sessions are project-scoped and use the current workspace folder when available.
- `internal/ai/ai.go` is still a placeholder and should not be treated as production code yet.
