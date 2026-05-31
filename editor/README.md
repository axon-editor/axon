# Axon Editor

Electron + React + TypeScript frontend for Axon. This is the desktop app that renders the editor UI, sidebar, terminal panel, settings, and all renderer-side interaction.

## What It Does

- Boots the Electron shell
- Renders the editor UI in the renderer process
- Talks to the Go backend for file, folder, terminal, and settings operations
- Builds the main process and renderer bundles separately

## Layout

```text
editor/
├── src/main/        # Electron main process
├── src/preload/     # contextBridge API surface
└── src/renderer/    # React application
    ├── components/
    └── lib/
```

## Run

```bash
cd editor
npm install
npm run build:main
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- `build:main` compiles the Electron main process TypeScript.
- `build:renderer` builds the React app with Vite.
- `npm run dev` expects the backend to be available locally while the app is running.
