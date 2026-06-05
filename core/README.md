# Axon Core

Go backend for Axon. It owns the local HTTP API, file system operations,
workspace search, terminal PTY bridge, and server-side pieces that the Electron
app talks to through HTTP or WebSocket.

## What It Does

- Serves the local API on port `7777`
- Reads, writes, and scans project files
- Skips generated folders, media files, archives, and binary content during
  workspace search
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
- Packaged Axon builds include this core binary and start it automatically.
- Terminal sessions are project-scoped and use the current workspace folder when available.
- Workspace search is intentionally conservative: it should find source text
  quickly without showing binary/media previews.
- `internal/ai/ai.go` is still a placeholder and should not be treated as production code yet.
