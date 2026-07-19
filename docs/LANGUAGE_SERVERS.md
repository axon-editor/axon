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
| Go | `gopls` | Bundled with Axon |
| Python | `pyright-langserver` | Bundled with Axon |
| Rust | `rust-analyzer` | Installed on demand |
| C / C++ | `clangd` | Installed on demand |
| Java | `jdtls` with private JRE | Installed on demand |
| C# | C# language server with private .NET | Installed on demand |
| Kotlin | `kotlin-language-server` with shared JRE | Installed on demand |
| PHP | `intelephense` | Bundled with Axon |
| Lua | `lua-language-server` | Installed on demand |
| XML / Protocol Buffers | `lemminx` / `protols` | Installed on demand |
| Swift / Ruby / Scala / R / PowerShell | Runtime-backed servers | Installed or connected on demand |
| Dart / SQL / TOML / Zig / Terraform / LaTeX | Language-specific servers | Installed on demand |
| Clojure / Haskell / Erlang / Assembly / Makefile | Language-specific servers | Installed on demand |

## Current LSP Features

- Automatic workspace language detection.
- Status-bar Language Tools access with workspace and complete catalog views.
- Clear server status: bundled, running, available, missing, or failed.
- Server lifecycle start/stop.
- Server restart after runtime or virtual environment changes.
- LSP logs visible through the Output panel.
- Install, cancel, update, repair, and uninstall actions for managed tools.
- Active-file server startup.
- Completion requests.
- Rich completion items: snippets, text edits, commit characters, and
  additional edits.
- Instant local-symbol fallback so the popup appears quickly.
- Instant Python built-in fallback so common names like `print` appear while
  Pyright is still starting.
- Live diagnostics from `textDocument/publishDiagnostics`.
- Python virtual environment selection for import resolution.
- Runtime requirement messages for ecosystem-backed tools that use an existing
  Swift, Ruby, R, or Python installation.

## Python Virtual Environments

Python projects often keep framework packages such as Django, DRF, FastAPI, or
Flask inside a project virtual environment. Pyright cannot resolve those imports
from the global Python runtime unless Axon tells it which interpreter belongs to
the project.

Select the Python virtual environment and choose the folder that contains the
environment, such as `.venv` or `venv`. Axon detects
the interpreter inside that folder, saves both the environment path and the
resolved interpreter path, then sends those settings to Pyright during startup.

After changing the environment, use the Language Tools `Restart` action. That
restarts Pyright with the new interpreter settings, which is safer than trying
to reuse an already-started server that analyzed the workspace with stale
runtime paths.

## How Language Tools Ship

TypeScript, Python, PHP, HTML, CSS, JSON, YAML, Bash, Docker, Tailwind, and the
other npm-backed web servers ship inside the Electron app. Go is the only native
language server baked into each platform release:

```text
editor/build/language-servers/<platform>-<arch>/<server>/bin/<executable>
```

Packaged builds filter Electron `extraResources` to the `go` directory. Native
servers and private runtime dependencies for other languages are installed into
Axon's user-data directory only after the user chooses Install in Language Tools.

Managed downloads use the current platform and architecture, pin reviewed asset
versions and checksums, reject unsafe archive contents, and activate only after
verification succeeds. Cancelling or failing an install removes staging data
without replacing a working tool.

Generated Go binaries are intentionally ignored in source control. Developers
who clone the repo can run `npm --workspace axon run build:language-servers` to
recreate the local release bundle.

Java and Kotlin share Axon's private managed JRE. C# uses Axon's private managed
.NET runtime, and PowerShell can use a private managed `pwsh` runtime. Project
toolchains are still separate: C/C++ projects benefit from
`compile_commands.json`, and language servers do not replace compilers, package
managers, or SDK requirements imposed by the project itself.

## Next LSP Work

- Add per-workspace language-tool version policies.
- Add signed first-party mirrors for upstream assets that do not publish stable
  checksummed releases.
