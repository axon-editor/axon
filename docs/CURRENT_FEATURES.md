# Current Features

Axon currently includes:

- Real folder/workspace opening
- Lazy file tree with Git colors, ignored-path handling, and independent watcher
  ownership in every Axon window
- Split panes, draggable tabs, dirty indicators, and close prompts
- Shared Monaco models across panes
- Live Markdown preview tabs connected to dirty editor content, with GFM,
  Mermaid diagrams, KaTeX math, footnotes, callouts, frontmatter, table of
  contents, heading links, theme-aware code fences, copy actions, PDF export,
  and editor/preview scroll synchronization
- Full-height HTML preview with browser logs routed into Output
- Image/video preview through Axon protocols
- Workspace search with jump-to-line and binary/cache exclusions
- Cmd+P project file search with file-first results and `>` command search
- Source control, side-by-side diffs, live Git line paint, branch/stash
  workflows, conflict helpers, and worktree management
- Git Graph editor tab with commit details, changed-file tree, comparisons,
  and commit hover details
- Problems panel with project-aware LSP diagnostics and copy actions
- Problems as editor tabs opened from the status bar
- Test explorer with project-aware provider discovery, target runs, and inline
  output
- Integrated terminal with tabs, isolated PTY ownership, bounded replay,
  200,000-line xterm scrollback, committed-byte acknowledgements, frame-coalesced
  scrollback repainting, and session health diagnostics
- Built-in terminal workbench contribution loaded from the extension-oriented
  architecture
- Interactive `axon` terminal sessions with workspace context, saved
  conversations, `axon resume`, slash commands, model selection, animated CLI
  header, and streaming responses
- Settings UI and settings JSON
- Extension-backed built-in themes, custom themes, and imported fonts
- Code Snapshot editor tool with theme-aware syntax colors, configurable
  presentation, watermarking, clipboard copy, and PNG export
- Declarative user/workspace extension discovery plus trusted built-in runtime
  activation, command execution, contribution registries, diagnostics, and
  workbench feature routing
- Splash screen and custom app icon/name
- Low-latency LSP completion, hover, diagnostics, navigation, rename, and
  formatting across bundled and install-on-demand language servers
- Tailwind CSS warnings, hover details, and variant-aware utility completions
- Rich syntax coloring through Monaco, TextMate/Shiki grammars, LSP semantic
  tokens, Axon decorations, and language-specific fallbacks
- Token inspector for debugging actual rendered syntax colors and semantic
  decoration output
- Workspace-aware Language Tools for detected languages, server installation,
  lifecycle controls, status, install progress, and logs
- Live LSP diagnostics routed into Problems
- Format-on-save support with bundled Prettier fallback for common web and
  document languages when a language server does not format the file

[Back to the project README](../README.md)
