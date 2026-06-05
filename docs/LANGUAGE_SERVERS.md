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
| Go | `gopls` | Requires local Go toolchain install |
| Python | `pyright-langserver` | Requires local install |
| Rust | `rust-analyzer` | Requires local install |
| C / C++ | `clangd` | Requires local install |

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

```bash
npm install -g pyright
```

```bash
go install golang.org/x/tools/gopls@latest
```

```bash
rustup component add rust-analyzer
```

```bash
# macOS with Homebrew
brew install llvm
```

## Why Some Servers Are Not Bundled

TypeScript is practical to bundle because the language server and compiler are
npm packages that can ship inside the Electron app.

Go, Rust, Python, and C/C++ tooling is more closely tied to the user's local
toolchain, SDK, virtual environment, or compiler setup. Axon should discover
those tools and explain what is missing instead of shipping stale toolchains
inside the app.

## Next LSP Work

- Hover.
- Go to definition.
- Find references.
- Rename symbol.
- Formatting.
- Code actions.
