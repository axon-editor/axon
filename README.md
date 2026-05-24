# Axon

A lightweight, AI-powered code editor built from scratch with Electron, React, TypeScript, and a Go backend.

Built for personal use, designed to grow.

## Stack

**Editor (electron + react + typescript)**
- Electron for desktop shell
- React + TypeScript + Tailwind CSS for UI
- Monaco Editor for the editing surface
- Vite as the bundler

**Core (go)**
- HTTP server on port 7777
- File system API (tree, read, write)
- Will house AI routing, LSP proxy, and more

## Project Structure

```
axon/
├── editor/          # Electron + React + TypeScript frontend
│   ├── src/
│   │   ├── main/        # Electron main process
│   │   ├── preload/     # contextBridge API surface
│   │   └── renderer/    # React UI
│   │       ├── components/
│   │       └── lib/
└── core/            # Go backend
    ├── cmd/axon/        # entry point
    └── internal/
        ├── server/      # HTTP server and route handlers
        ├── fs/          # file system operations
        └── ai/          # AI routing (coming soon)
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

## Current Features

- Open any folder and browse the file tree
- Collapsible sidebar with file type icons
- Multi-tab editing with per-tab dirty state
- Cmd+S to save files
- External file change detection (edits from other editors reflect instantly)
- Directories sorted before files alphabetically

## Roadmap

- [ ] Tab management improvements (reorder, drag)
- [ ] Create and delete files and folders from sidebar
- [ ] Terminal panel
- [ ] AI completion (goai trigger, Ollama + OpenAI + Anthropic)
- [ ] LSP integration for IntelliSense
- [ ] Settings panel (font, theme, keybindings)
- [ ] Command palette
