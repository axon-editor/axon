# Axon Editor

Electron + React + TypeScript frontend for Axon. This package owns the desktop
shell, renderer UI, Monaco editor surface, IPC bridge, updater integration,
settings UI, terminal UI, previews, and LSP client wiring.

## What It Does

- Boots the Electron shell
- Renders the editor UI in the renderer process
- Talks to the Go backend for file, folder, terminal, and settings operations
- Builds the main process and renderer bundles separately
- Starts the bundled Go core automatically in packaged builds
- Hosts the LSP client bridge for completions and diagnostics

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

## Download Guide

- macOS Apple Silicon: `Axon-<version>-arm64.dmg`
- macOS Intel: `Axon-<version>.dmg`
- Windows: `Axon.Setup.<version>.exe`
- Linux AppImage: `Axon-<version>.AppImage`
- Linux Debian/Ubuntu: `axon_<version>_amd64.deb`

If macOS says the app is not supported, the downloaded build does not match the
Mac architecture. Intel Macs need the x64 `.dmg`; Apple Silicon Macs need the
arm64 `.dmg`.

## GitHub Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

The repo release workflow builds the editor on macOS, Windows, and Linux runners
and uploads the generated files from `editor/release/` into a draft GitHub
Release. The draft state is intentional so the release can be checked before it
is published.

## Updates

Unsigned personal macOS builds cannot guarantee a fully automatic update,
replace, and relaunch flow. Axon can detect releases and show update state, but
manual download/replacement is still the reliable path until the app is signed
and notarized.

See `../docs/UPDATES.md`.

## Language Servers

Axon bundles TypeScript/JavaScript language-server dependencies and detects
external servers for Go, Python, Rust, and C/C++.

See `../docs/LANGUAGE_SERVERS.md`.

## Notes

- `build:main` compiles the Electron main process TypeScript.
- `build:renderer` builds the React app with Vite.
- `npm run dev` expects the backend to be available locally while the app is running.
- `npm run dist` uses electron-builder and builds for the host platform.
- Cross-platform builds may require the target platform tooling and signing setup.
