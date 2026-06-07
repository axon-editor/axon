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
| C# | `csharp-ls` | Axon managed bundle path |
| Kotlin | `kotlin-language-server` | Axon managed bundle path |
| Ruby | `solargraph` | Axon managed bundle path |
| PHP | `intelephense` | Bundled with Axon |
| Lua | `lua-language-server` | Axon managed bundle path |

## Current LSP Features

- Server detection in Settings.
- Server lifecycle start/stop.
- Active-file server startup.
- Completion requests.
- Rich completion items: snippets, text edits, commit characters, and
  additional edits.
- Instant local-symbol fallback so the popup appears quickly.
- Live diagnostics from `textDocument/publishDiagnostics`.

## Install Commands

These commands are examples. Use the install method that fits the machine.

## Why Some Servers Are Not Bundled

TypeScript, Python, PHP, Docker, and Tailwind are practical to bundle because
their language servers are npm packages that can ship inside the Electron app.

Go, Rust, C/C++, Java, C#, Kotlin, and Lua are downloaded or built into Axon's
managed language server bundle directory during release builds:

```text
editor/build/language-servers/<platform>-<arch>/<server>/bin/<executable>
```

Packaged builds copy that directory into Electron `extraResources` as
`language-servers/`. That lets Axon ship runtime-backed tools per platform
without asking every project to install them separately.

Ruby is already wired to the same managed bundle path, but it is not downloaded
automatically yet because the practical servers are Ruby gems rather than
standalone platform archives. Fully bundled Ruby support needs a Ruby runtime
bundle plus the selected gem server.

Bundled Java/Kotlin/C# servers still expect the matching language runtime or
SDK to be available for real project analysis. C/C++ projects still need build
metadata such as `compile_commands.json` for best results. That is different
from asking the user to install the language server itself: Axon ships the
server payload, while the project toolchain remains the user's normal
development runtime.

## Next LSP Work

- Add a Ruby runtime + gem bundle for managed Ruby support.
- Add Settings UI actions for installing/updating managed language tools.
- Show runtime/toolchain requirements beside each bundled server in Settings.
