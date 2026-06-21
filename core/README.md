# Axon Core

Axon Core is the local Go backend used by the Axon desktop app. It owns the
parts that should not live in the renderer: workspace file operations, fast
search, terminal PTY sessions, and local HTTP/WebSocket APIs.

Packaged Axon builds include the core binary and start it automatically, so end
users do not need Go installed just to open folders, search, or use the
terminal.

## Responsibilities

- Serve the local API used by the Electron renderer.
- Read, write, rename, delete, and scan workspace files.
- Run workspace search while skipping generated folders, media files, archives,
  and binary content.
- Bridge terminal tabs to real shell processes through a WebSocket-backed PTY.
- Keep terminal sessions alive across panel hides, renderer reconnects, and tab
  switches until the user explicitly closes the terminal.
- Provide the backend surface future AI features can build on without giving the
  renderer broad file-system or shell access.

## Layout

```text
core/
├── cmd/axon/          # axon-core server entry point
├── cmd/axon-agent/    # source for the axon CLI companion
└── internal/
    ├── agentcli/      # thin CLI client that talks to a running axon-core
    ├── ai/            # placeholder for future local AI/backend flows
    ├── fs/            # workspace file, folder, drag/drop, and search helpers
    ├── server/        # HTTP server, route registration, and CORS handling
    └── terminal/      # PTY lifecycle, terminal replay, resize, and websocket bridge
```

## Run Locally

```bash
cd core
go run cmd/axon/main.go
```

By default the server listens on port `7777`. The Electron dev app usually runs
core on another port so it does not collide with a manually started backend:

```bash
AXON_CORE_PORT=17777 go run cmd/axon/main.go
```

The renderer selects the matching URL through its core API configuration. If the
desktop app cannot connect, folder operations and terminals will fail even if
the UI itself is running.

When core starts it writes the selected port to `~/.axon/core.port`. The `axon`
CLI reads that file first and falls back to `7777`, so terminal
commands do not need to guess the desktop app's local API port.

## Axon Agent CLI

The terminal companion lives under `cmd/axon-agent` in source, but it is built
and shipped as the `axon` command. This keeps the existing core server
entrypoint stable while giving users the expected terminal flow: `axon .`,
`axon ask`, and `axon commit`.

```bash
go run cmd/axon-agent/main.go .
go run cmd/axon-agent/main.go ask "why is startup slow?"
go run cmd/axon-agent/main.go fix
go run cmd/axon-agent/main.go commit
```

`axon ask` loads the current directory as the workspace, asks core for the
same project context pack the sidebar uses, and streams `/ai/chat/stream`
responses to stdout. `axon commit` reads `git diff --staged`, streams a
draft commit message, then asks before running `git commit`.

`axon fix` reads `~/.axon/diagnostics.json`, which the open editor exports from
the current Problems panel. It sends those diagnostics through the local agent,
requires an edit proposal, and writes only files that resolve inside the
diagnostics workspace.

## Test

```bash
go test ./...
```

## Terminal Behavior

Each terminal tab maps to a persistent core session. The WebSocket is only the
view transport; the shell process belongs to the session map in core. That
separation is important because hiding the terminal panel, switching tabs, or
briefly reconnecting the renderer should not kill a running command.

The terminal starts in the selected workspace folder when one is available. In
local development, if core is launched from `core/`, the fallback walks up to the
repo root so the shell opens in the project instead of the backend subfolder.

## Search Behavior

Workspace search is intentionally conservative. It should stay fast and useful
for source code by ignoring dependency folders, build outputs, caches, archives,
media, and binary files. Search preview should only show text content that Axon
can safely render.
