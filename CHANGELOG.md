# Changelog

## Next

## v1.2.5

- Added tabbed onboarding so the welcome experience behaves like a real editor
  tab instead of a detached one-time panel.
- Added sidebar docking so the file/source-control/sidebar rail can live on
  the right side of the editor and persist as an app-wide preference.
- Added editor font zoom shortcuts with command/shift plus and minus so text
  size can be adjusted from the keyboard.
- Improved the `axon` terminal composer with a fuller text box, multiline
  input, Escape interruption, and a cleaner local-command flow.
- Hardened `axon .` and terminal workspace handoff so CLI-opened folders route
  through the same workspace loading path as the folder picker.
- Added built-in One and Solarized theme families and moved built-in theme
  source assets under `editor/public/assets/themes`.
- Removed unused React starter SVG assets from the renderer bundle.
- Made more editor chrome theme-aware, including sidebar hover/active states,
  workspace root headers, tab surfaces, markdown preview, errors, modals, and
  the AI sidebar.
- Fixed folder picker/open modal readability on light themes by replacing
  hard-coded dark colors with Axon theme tokens.
- Reduced gitignored sidebar dimming so ignored files and folders stay readable
  while still looking muted.
- Fixed expanded sidebar folders after external disk moves by refreshing their
  lazy child caches when the workspace watcher publishes a fresh tree.
- Added a dedicated fixes section to the release notes so the shipped
  regression fixes and UI corrections are easy to scan separately from the
  feature work.

## v1.2.4

- Added interactive `axon` terminal sessions so running `axon` without
  arguments starts a workspace-aware local conversation instead of printing
  usage text.
- Added saved terminal conversations with `axon resume` and `axon resume :id`
  so workspace sessions can be listed and restored from the command line.
- Added slash commands, model selection, custom prompt rendering, and streaming
  status polish to the terminal agent experience.
- Carried conversation history and project context through CLI requests so
  follow-up prompts stay tied to the current workspace.
- Hardened local agent prompts against placeholder paths, fake file counts,
  invented URLs, and missing project facts.
- Split main-process startup into a tiny boot splash entry and the full app
  bootstrap so the splash appears before heavier editor services load.
- Switched workspace watchers to native filesystem events by default, with
  polling kept behind `AXON_WATCH_USE_POLLING`.
- Kept external disk changes responsive with atomic watcher handling and short
  debounce windows.
- Stopped project-wide diagnostics from running during workspace open and
  watcher bursts so startup stays lightweight.
- Delayed active-file language-server startup instead of starting every
  relevant server during restore.
- Split Monaco language ids from LSP language ids so TSX and JSX render with
  Monaco's editor support while syncing to language servers as React documents.
- Added TypeScript completion resolve support so package auto-import edits from
  libraries such as `lucide-react` can be applied correctly.
- Added Tailwind variant-aware completions so prefixes such as `hover:` suggest
  proper utility classes.
- Attached Tailwind alongside web language servers so Tailwind warnings and
  hover content flow through Axon's LSP pipeline.
- Preserved diagnostics per language server before merging them by file so
  Tailwind and TypeScript diagnostics do not overwrite each other.
- Added bundled Prettier fallback formatting for common editor languages when
  an LSP formatter is unavailable or returns no edits.
- Restored Monaco's native editor hover UI while keeping improved LSP and
  Tailwind hover data.
- Improved Axon Dark and Sora syntax colors with stronger separation for
  functions, methods, types, properties, parameters, JSX tags, and constants.
- Added a pre-React drag strip for early startup and restored renderer
  app-region chrome so the app remains draggable after React loads.
- Fixed Git history avatar fallback handling so commit history keeps a stable
  author image path.

## v1.2.3

- Fixed legacy local-provider prompts so prior conversation turns are passed to
  the model for follow-up context.
- Added a timeout to the non-streaming local-provider request path so a stalled
  local model cannot hang forever.
- Hardened edit proposal application by rejecting paths outside the current
  workspace and stripping multi-file edit proposal JSON correctly.
- Added a project-context token budget trim before sending context packs to
  local models.
- Kept Ask Axon command entry points behind workspace trust because local agent
  tools can read and search project files.
- Added the first `axon` terminal companion build, with `axon .`,
  `axon ask`, and `axon commit` routed through `axon-core`.
- Added `axon fix`, which reads exported editor Problems, streams a local fix
  request, applies edit proposals inside the workspace, and lets watchers/LSP
  refresh diagnostics.
- Added the `~/.axon/core.port` contract so the terminal command can find the
  running backend without hardcoded discovery.
- Added `~/.axon/diagnostics.json` export from the renderer so terminal agent
  commands can work from the same Problems data shown in Axon.
- Improved packaged cold start by showing the editor window before waiting for
  bundled `axon-core` health.
- Added the first Axon status-bar identity pass with an animated accent strip,
  stronger active status controls, and a tighter footer treatment.
- Restored richer Monaco semantic token colors so functions, methods, classes,
  interfaces, parameters, and properties get distinct syntax colors.
- Removed the global Monaco foreground override that flattened token classes
  back to the default editor text color.
- Restored Git color on sidebar file and folder names while keeping the newer
  dot and status-label indicators.
- Enabled scrolling beyond the last editor line so users can keep reading and
  editing with breathing room at the bottom of the buffer.
- Updated core packaging so releases build and ship both `axon-core` and the
  `axon` CLI binary.
- Added an app-owned command-line tool prompt so macOS users can install or
  update `/usr/local/bin/axon` from Axon instead of discovering `command not
  found` in the terminal.
- Renamed the local development copy source to `AXON_FEATURES_AND_WORK.md` so
  it describes shipped features and active work for the future website.

## v1.2.2

- Added project-aware Axon Agent tools in `axon-core` for listing workspace
  files, reading project files, and searching project text.
- Routed Ask Axon through a backend tool-aware local model flow so project
  questions can be answered from filesystem tool results instead of a large
  renderer-built prompt.
- Added a fallback project probe for smaller local models that try to answer
  project questions without calling tools.
- Removed renderer-side project context preloading so the chat UI starts
  streaming without waiting on a large workspace context pack.
- Started the local Axon models runtime during app startup when it is installed
  but not already running.
- Improved packaged macOS runtime discovery by checking common Ollama install
  paths outside the GUI app `PATH`.
- Added workspace-scoped Ask Axon conversation sessions with switching, new
  conversations, and confirmed per-conversation clearing.
- Split Ask Axon conversation picker, message list, and clear-confirmation UI
  into focused components to keep sidebar files maintainable.

## v1.2.1

- Added fuller local Git workflows: branch creation/checkout, stash create/apply
  /pop/drop, merge conflict listing and resolution helpers, worktree controls,
  and a compact commit graph.
- Added multi-root workspace foundations with a workspace overview surface for
  switching roots and scanning root status.
- Added advanced language tooling surfaces for definitions, references, rename,
  formatting, language-server status, file symbols, and TSX-aware editor
  behavior.
- Added a Test Explorer with provider discovery, per-target runs, output
  streaming, and run result feedback.
- Fixed Cmd+P so it indexes project files directly instead of only searching
  folders that were already expanded in the lazy sidebar tree.
- Made Cmd+P file-first by default, with `>` reserved for command search.
- Broadened project-file indexing exclusions across dependency, build, cache,
  mobile, native, Python, Rust, Go, Java, .NET, and Zig project folders.
- Added Go cache exclusions for `.gocache`, `.gochache`, and `.go-build`.
- Fixed Git stash listing by parsing a stable stash format so `WIP on main`
  entries show up with apply, pop, and drop actions.
- Clarified the stash icon tooltip so it explains that stashing saves
  uncommitted changes and hides them from Source Control.
- Reduced sidebar Git color intensity by showing Git state as a small dot and
  label instead of tinting the entire filename row.
- Made deleted Git state win over added state when files move through
  create/delete transitions.
- Kept TSX files on Monaco's supported TypeScript language id while preserving
  React-aware completion behavior through the `.tsx` file path.

## v1.2.0

- Kept sidebar file operations in sync locally when files or folders are
  created, renamed, moved, or deleted.
- Restored root-level context actions when a workspace has content.
- Improved Git status parsing with NUL-delimited output so paths with spaces
  and media filenames are read correctly.
- Kept renamed and moved Git tree decorations aligned with real filesystem
  paths.
- Added font-family previews inside search dropdown entries.
- Replaced the workspace trust revocation browser confirm with a custom Axon
  modal that explains disabled execution surfaces.
- Clarified cursor blinking settings, including the `expand` mode.

## v1.1.9

- Stabilized terminal replay and reconnect handling so long-running terminal
  sessions keep visible output.
- Kept multiline terminal input on a bracketed-paste path so `Shift+Enter`
  inserts a newline instead of submitting early.
- Fixed packaged Node-backed language servers so they launch from
  `app.asar.unpacked` real filesystem paths.
- Completed packaged language-server dependency resolution for nested runtime
  packages and runtime `doc/` folders.
- Verified packaged Pyright, HTML, CSS, JSON, YAML, Go, Rust, and C++ language
  servers from release bundles.
- Improved cold LSP completion behavior while servers are still initializing.
- Added workspace/configuration responses for Pyright and common server-side
  LSP requests.
- Improved Python virtual environment configuration flow so project imports
  resolve more reliably in packaged Axon.

## v1.1.8

- Increased integrated terminal scrollback so long AI and TUI sessions keep
  much more output instead of dropping older text.
- Added pinned editor tabs, including context menu pin/unpin actions and
  restore-safe layout normalization for older saved sessions.
- Added a custom in-editor Find surface for `Cmd+F` / `Ctrl+F` with next,
  previous, Escape close, and highlighted matches.
- Added external Finder/Explorer drag and drop into the sidebar, including
  workspace root imports, folder imports, and no-workspace folder selection.
- Made Git status refresh faster after filesystem changes so sidebar colors
  update more quickly for created, modified, and deleted files.
- Fetched full Git history and rendered Source Control/Git History diffs with
  Monaco's diff editor using old/new file contents.
- Added better Git author avatar resolution and skeleton loading states for Git
  panels.
- Marked open tabs whose files were deleted from disk with a red strikethrough
  state.
- Hardened IPC shutdown guards and language-server failure reporting.

## v1.1.7

- Preserved terminal scroll position while switching terminal tabs.
- Fixed prompt wrapping and reconnect noise in the integrated terminal.
- Routed confirmed terminal links through the default browser handler.
- Fixed New Window after the main-process architecture split.
- Adjusted unsigned Windows update behavior for Axon's personal builds.
- Moved Spotify toward Axon's built-in managed client flow and removed the
  manual user-facing client ID input.
- Added Spotify device discovery, selected-device playback, and playlist
  infinite scrolling.
- Added the first Axon Agent right-sidebar surface with a status-bar toggle
  controlled by AI settings.
- Fixed packaged language-server resolution for npm-backed bundled servers.

## v1.1.6

- Split the large main and renderer files into feature-oriented folders while
  preserving existing behavior.
- Improved terminal shell startup, environment loading, keepalive handling, and
  binary PTY output transport.
- Added managed language-server verification to release builds.
- Improved TypeScript SDK resolution and cross-file definition navigation.
- Added the full Git History sidebar flow with commit details and editor diff
  views.
- Moved Files, Git History, and Spotify switches into the status bar with
  separators.
- Added Spotify sidebar and floating player state, artwork, and settings
  persistence.
- Added release packaging checks so managed language-server bundles are present
  before desktop artifacts are built.

## v1.1.5

- Kept terminal sessions alive across renderer WebSocket reconnects.
- Added a packaged core watchdog so the bundled backend can restart if it stops
  responding.
- Preserved native Windows window controls while shifting Axon toolbar controls
  away from them.
- Fixed Windows workspace labels so the titlebar shows the folder name instead
  of the full path.
- Prevented invalid placeholder paths from reaching Source Control Git
  commands.
- Added inline sidebar creation for files and folders with duplicate-name
  feedback.
- Added a fixed workspace-root create/drop strip and sidebar drag resizing.
- Hid workspace/file-specific actions until a folder or file is active.

## v1.1.4

- Added a shared renderer backend URL helper so file APIs and terminal
  WebSocket sessions resolve the same Axon core origin.
- Added terminal backend health retries before opening a terminal WebSocket so
  startup races do not immediately close new terminal tabs.
- Improved terminal backend failure messaging when Axon core is not reachable.
- Fixed terminal keyboard input after delayed WebSocket connection setup.
- Restored a draggable top toolbar region while keeping toolbar buttons
  clickable.
- Fixed malformed sidebar header classes that could break workspace chrome and
  drag-region styling.

## v1.1.3

- Added Python virtual environment selection in Settings so Pyright can resolve
  project imports from `.venv`, `venv`, or another selected environment.
- Added Python interpreter detection from the selected virtual environment and
  sent the resolved interpreter settings to Pyright during initialization and
  configuration refresh.
- Added a Language Servers restart action so Python import settings can be
  reloaded without restarting the whole editor.
- Added immediate Python built-in completions for common names such as `print`
  while the external language server is still starting.
- Improved first-request LSP completion behavior by auto-starting the matching
  server and waiting briefly for initialization before returning an empty
  result.
- Added LSP server logs to the Output panel so missing runtimes, bad virtualenv
  paths, and server startup errors are visible inside Axon.
- Added clearer Language Server Settings statuses for bundled, running,
  missing, and failed-start servers.
- Added runtime requirement messages for servers that still depend on a project
  runtime such as Python virtualenvs, JDK, or .NET.
- Documented how Python virtual environment selection works and when to restart
  the language server.

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
