# Changelog

## v1.1.2

- Added broader active LSP routing for Go, Rust, Python, C/C++, Java, C#,
  Kotlin, PHP, Lua, Docker, Tailwind CSS, and TypeScript/JavaScript.
- Added managed language-server bundling for Go `gopls`, Rust
  `rust-analyzer`, C/C++ `clangd`, Java `jdtls`, C# OmniSharp, Kotlin
  `kotlin-language-server`, and Lua `lua-language-server`.
- Added bundled npm-backed language servers for Python `pyright`, PHP
  `intelephense`, Docker, Tailwind CSS, and TypeScript/JavaScript.
- Updated release packaging so GitHub Actions builds platform-specific managed
  server bundles before Electron packages each desktop artifact.
- Pinned macOS release runners so Intel builds get `darwin-x64` server bundles
  and Apple Silicon builds get `darwin-arm64` server bundles.
- Expanded file and folder icon mappings for image, photo, screenshot, SVG,
  video, and broad media asset paths.
- Documented that GitHub release assets include their matching managed
  language-server bundle, while source checkouts recreate generated binaries
  locally.
- Fixed Linux release bundling by extracting Open VSX `.vsix` language-server
  downloads as zip archives.
- Fixed Windows release bundling by detecting `OmniSharp.exe` in the managed C#
  language-server archive.

## v1.1.1

- Fixed development startup so Vite stays on port `5173` instead of silently
  shifting to another port while Electron still loads the old URL.
- Added a development-only Electron single-instance guard so repeated
  `npm run dev` launches focus the existing dev app instead of leaving multiple
  Electron Dock icons.
- Added NVM Node version discovery to Axon's integrated terminal PATH fallback
  so `node` and `npm` are available even when the app is launched outside a
  fully configured shell.

## v1.1.0

- Added a bundled local extension system path so Axon can ship default
  extension packages alongside the packaged app.
- Added bundled Axon theme extensions for Arctikai, Anysphere, Apathy,
  Apathetic Ocean, and Minted.
- Included bundled extensions in Electron Builder packaging so shipped themes
  are available in development and packaged builds.
- Added Monaspace Nerd Font families for Neon, Argon, Krypton, Radon, and
  Xenon, with core weights available from ExtraLight through ExtraBold.
- Added Monaspace Nerd Font presets for editor and terminal usage.
- Hardened extension theme reload so broken theme contributions cannot crash
  Monaco theme registration.

## v1.0.8

- Added a real theme system under `editor/src/renderer/lib/themes/` with
  separate Axon Dark, Sora, Zed Dark, Catppuccin Mocha, and Ayu Dark modules.
- Added Appearance Engine v1 with UI tokens and syntax-color tokens defined
  together by each built-in theme.
- Added richer syntax-color tokens for comments, strings, numbers, keywords,
  functions, methods, classes, types, interfaces, variables, constants,
  operators, brackets, imports, JSX tags, and attributes.
- Added live syntax-color and UI-token overrides through settings JSON and the
  Settings UI, with overrides layered on top of built-in themes instead of
  hardcoding Ayu Dark as a default override.
- Added font style presets, font weight, and live editor/UI/terminal font
  updates while keeping letter spacing fixed at 0.
- Added LSP hover support through Monaco's native hover cards.
- Added LSP-backed go-to-definition and find-references providers for
  TypeScript/JavaScript, Go, Rust, Python, and C/C++.
- Added LSP-backed rename symbol and format document commands through the
  command palette.
- Kept language-server responses normalized in the main process before crossing
  IPC, which keeps the renderer contract small and safer for future AI usage.

## v1.0.7

- Added richer LSP completion handling with snippets, text edits, commit
  characters, preselect, and additional edits.
- Added instant local-symbol completions so the autocomplete popup has useful
  prefix matches before an external language server responds.
- Added live LSP diagnostics plumbing into the Problems panel.
- Added bundled TypeScript/JavaScript language-server dependencies for packaged
  editor builds.
- Improved workspace search speed with request cancellation, early result caps,
  and cached query results.
- Excluded generated Go caches, common dependency/build folders, media files,
  archive files, font files, source maps, and binary content from workspace
  search previews.
- Replaced plain loading text with skeleton loading states.
- Improved search result and autocomplete popup readability.
- Fixed Markdown preview links so external URLs open in the system handler and
  local Markdown links open as Axon files instead of navigating the app window.

## v1.0.6

- Added the first LSP-backed completion path.
- Added TypeScript/JavaScript completion startup from active files.
- Improved Monaco completion popup behavior and styling.

## v1.0.5

- Improved updater behavior for unsigned personal builds.
- Added clearer update states and release-note handling.
- Fixed packaged app asset and icon loading issues.

## v1.0.4

- Added background update download flow.
- Improved release/download documentation.
- Fixed workspace folder switching and sidebar placement issues.

## v1.0.3

- Added HTML preview foundations.
- Added live preview target handling and browser-opening support.

## v1.0.2

- Improved file icons and Git diff refresh behavior.
- Fixed native quit cleanup issues.

## v1.0.1

- Improved Markdown preview rendering.
- Added Markdown code block copy feedback.
- Added release workflow notes.

## v1.0.0

- First packaged Axon release.
- Included core editor, file tree, split panes, terminal, settings, Git basics,
  Markdown preview, and packaged Go backend startup.
