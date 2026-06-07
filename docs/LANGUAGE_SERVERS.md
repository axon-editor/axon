# Language Servers

Axon uses the Language Server Protocol for editor intelligence. The editor owns
the UI and IPC lifecycle; language servers own project analysis.

This is the same architecture used by editors like VS Code and Zed. Axon should
not reimplement type systems, import resolution, or compiler diagnostics in the
renderer.

## Supported Foundation

| Language | Server | Status |
| --- | --- | --- |
| TypeScript / JavaScript | `typescript-language-server` | Bundled with Axon |
| Go | `gopls` | Axon managed bundle path |
| Python | `pyright-langserver` | Bundled with Axon |
| Rust | `rust-analyzer` | Axon managed bundle path |
| C / C++ | `clangd` | Axon managed bundle path |
| Java | `jdtls` | Axon managed bundle path |
| C# | `OmniSharp` | Axon managed bundle path |
| Kotlin | `kotlin-language-server` | Axon managed bundle path |
| PHP | `intelephense` | Bundled with Axon |
| Lua | `lua-language-server` | Axon managed bundle path |

## Current LSP Features

- Server detection in Settings.
- Clear server status in Settings: bundled, running, missing, or failed.
- Server lifecycle start/stop.
- Server restart from Settings after runtime or virtual environment changes.
- LSP logs visible from Settings through the Output panel.
- Active-file server startup.
- Completion requests.
- Rich completion items: snippets, text edits, commit characters, and
  additional edits.
- Instant local-symbol fallback so the popup appears quickly.
- Instant Python built-in fallback so common names like `print` appear while
  Pyright is still starting.
- Live diagnostics from `textDocument/publishDiagnostics`.
- Python virtual environment selection for import resolution.
- Runtime requirement messages for servers that still need project tooling such
  as a Python venv, JDK, or .NET runtime.

## Python Virtual Environments

Python projects often keep framework packages such as Django, DRF, FastAPI, or
Flask inside a project virtual environment. Pyright cannot resolve those imports
from the global Python runtime unless Axon tells it which interpreter belongs to
the project.

Use `Settings -> Language Servers -> Python virtual environment` and select the
folder that contains the environment, such as `.venv` or `venv`. Axon detects
the interpreter inside that folder, saves both the environment path and the
resolved interpreter path, then sends those settings to Pyright during startup.

After changing the environment, use the Language Servers `Restart` action. That
restarts Pyright with the new interpreter settings, which is safer than trying
to reuse an already-started server that analyzed the workspace with stale
runtime paths.

## How Managed Bundles Ship

TypeScript, Python, PHP, Docker, and Tailwind are bundled through npm packages
that ship inside the Electron app.

Go, Rust, C/C++, Java, C#, Kotlin, and Lua are downloaded or built into Axon's
managed language server bundle directory during release builds:

```text
editor/build/language-servers/<platform>-<arch>/<server>/bin/<executable>
```

Packaged builds copy that directory into Electron `extraResources` as
`language-servers/`. That lets Axon ship runtime-backed tools per platform
without asking every project to install them separately.

The platform segment is based on Node's `process.platform` and `process.arch`.
For example, an Intel macOS build creates `darwin-x64`, while an Apple Silicon
build creates `darwin-arm64`. GitHub Actions runs this bundler separately on
macOS x64, macOS arm64, Windows x64, and Linux x64, so each release asset only
contains the server bundle that matches that artifact.

Those generated binaries are intentionally ignored in source control. Users who
download a GitHub release asset already have the matching managed servers inside
the app. Developers who clone the repo can run `npm run build:language-servers`
inside `editor/` to recreate the local bundle.

Bundled Java/Kotlin/C# servers still expect the matching language runtime or
SDK to be available for real project analysis. C/C++ projects still need build
metadata such as `compile_commands.json` for best results. That is different
from asking the user to install the language server itself: Axon ships the
server payload, while the project toolchain remains the user's normal
development runtime.

## Next LSP Work

- Add Settings UI actions for installing/updating managed language tools.
- Show runtime/toolchain requirements beside each bundled server in Settings.
