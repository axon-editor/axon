# Changelog

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
