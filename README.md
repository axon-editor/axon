# Axon

<p align="center">
  <img src="editor/src/renderer/public/axon.png" width="80" height="80" alt="Axon" />
</p>


A lightweight, AI-powered code editor built from scratch with Electron, React, TypeScript, and a Go backend.<br/>
Built for personal use, designed to grow.



<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Monaco_Editor-007ACC?style=flat&logo=visualstudiocode&logoColor=white" />
</p>

## Stack

**Editor — Electron + React + TypeScript**
- Electron for the desktop shell
- React + TypeScript + Tailwind CSS for UI
- Monaco Editor for the editing surface
- Vite as the bundler

**Core — Go**
- HTTP server on port 7777
- File system API (tree, read, write, move, create, delete)
- PTY terminal via WebSocket (gorilla/websocket + creack/pty)
- AI routing (coming soon)

## Project Structure

```
axon/
├── editor/                      # Electron + React + TypeScript frontend
│   └── src/
│       ├── main/                # Electron main process
│       ├── preload/             # contextBridge API surface
│       └── renderer/            # React UI
│           ├── components/
│           │   ├── EditorPane/  # Monaco editor, split panes, media preview
│           │   ├── Sidebar/     # File tree, context menu, folder picker
│           │   ├── TabBar/      # Tabs with drag reorder and inter-pane drag
│           │   └── Terminal/    # xterm.js terminal panel
│           └── lib/             # API client, layout manager, Monaco models
└── core/                        # Go backend
    ├── cmd/axon/                # Entry point
    └── internal/
        ├── server/              # HTTP server and route handlers
        ├── fs/                  # File system operations
        ├── terminal/            # PTY + WebSocket bridge
        └── ai/                  # AI routing (coming soon)
```

## Running Locally

**Start the Go backend**
```bash
cd core
go run cmd/axon/main.go
```

**Start the editor**
```bash
cd editor
npm run build:main
npm run dev
```

## Building V1

**Build the editor bundles**
```bash
cd editor
npm run build
```

**Create a packaged desktop app**
```bash
# Unpacked app for local inspection
npm run pack

# Installer/package for the current platform
npm run dist

# Platform-specific package commands
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Build artifacts are written to `editor/release/`.

For this v1 packaging setup, Axon’s Electron app and Go core service are still
separate. Start the core service before launching packaged builds when you need
terminal-backed features:

```bash
cd core
go run cmd/axon/main.go
```

Cross-platform builds can require platform-specific tooling and signing. macOS
builds are easiest from macOS; Windows and Linux release builds should be
verified on their target platforms before sharing broadly.

## Current Features

- Open any folder and browse the real file tree
- Collapsible sidebar with Catppuccin file and folder icons
- Drag and drop files between folders in the sidebar
- Multi-pane split editor (up to 5 panes, horizontal and vertical)
- Drag tabs between panes, resize panes with the divider
- Shared Monaco models — edits reflect across split panes instantly
- Multi-tab editing with per-tab dirty state indicator
- Cmd+S to save, external change detection via chokidar
- Right click context menu — new file, new folder, delete, split right
- Markdown preview with editor, split, and full preview modes
- Image and video preview via custom axon:// protocol
- Real terminal via PTY over WebSocket (zsh/bash)
- Command palette (Cmd+P) with fuzzy file search
- Sora dark theme ported from Zed with full Monaco syntax token mapping
- Recent folders with quick open from the sidebar and empty pane
- Zen mode — hides all chrome for distraction-free editing
- Git status, diffs, changed-file context copy, and gutter indicators
- Settings UI with theme, color, font, imported font, AI, and language-server sections
- Language-server detection and lifecycle groundwork

## Roadmap

- [ ] AI completion (goai trigger, Ollama + OpenAI + Anthropic)
- [ ] Full LSP diagnostics, definition, references, and completion wiring
- [ ] Bundle/sign the Go core service with packaged desktop releases
- [ ] Search result grouping and replace across files
- [ ] Extension/plugin system
