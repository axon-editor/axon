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

## Package V1

```bash
# Compile the Electron main process and renderer, then create an unpacked app.
npm run pack

# Build an installer/package for the current platform.
npm run dist

# Platform-specific targets.
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Packaged output is written to `editor/release/`. Release builds include the Go
core binary and start it automatically when Axon opens.

## GitHub Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

The repo release workflow builds the editor on macOS, Windows, and Linux runners
and uploads the generated files from `editor/release/` into a draft GitHub
Release. The draft state is intentional so the release can be checked before it
is published.

## Notes

- `build:main` compiles the Electron main process TypeScript.
- `build:renderer` builds the React app with Vite.
- `npm run dev` expects the backend to be available locally while the app is running.
- `npm run dist` uses electron-builder and builds for the host platform.
- Cross-platform builds may require the target platform tooling and signing setup.
