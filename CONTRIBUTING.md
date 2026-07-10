# Contributing to Axon

Axon is a personal-first code editor, but contributions are welcome when they
make the editor more stable, faster, clearer, or easier to maintain. Treat the
project like a serious desktop IDE: changes should be scoped, tested, and
aligned with the architecture already in the repository.

## Before You Start

- Small fixes such as typos, obvious bugs, focused UI polish, and narrow
  refactors can go straight to a pull request.
- Larger work such as new features, architecture changes, release/build changes,
  new dependencies, or new extension APIs should start with an issue or
  discussion first.
- If a change touches editor behavior, terminal sessions, source control,
  workspace loading, LSP, or extension activation, explain the failure mode and
  the reason for the chosen fix.

## Repository Layout

Axon is organized as a workspace:

- `apps/editor` contains the Electron desktop editor.
- `services/core` contains the Go backend service, terminal/session ownership,
  and local agent CLI code.
- `extensions/builtin` contains first-party built-in extensions such as themes,
  icons, terminal, agent, Git/source control, search, settings, testing,
  problems, previews, and language manifests.
- `packages` contains shared TypeScript packages such as extension APIs,
  protocol types, IPC helpers, and config helpers.
- `docs` contains architecture notes, release notes, language-server docs, and
  other project documentation.
- `tools` and `build` contain repository automation and validation scripts.

New work should move toward these boundaries instead of adding more unrelated
logic to old renderer folders. UI belongs with the owning workbench/built-in
surface; shared logic belongs in `lib`, platform, service, package, or backend
boundaries depending on who consumes it.

## Getting Set Up Locally

```bash
git clone https://github.com/axon-editor/axon.git
cd axon
npm install
```

Run the desktop app:

```bash
npm run dev
```

This delegates to the editor workspace, builds shared packages, prepares the
extension registry, checks language-server availability, starts the Go core
service, starts Vite, and launches Electron.

Useful commands:

```bash
npm run build:packages
npm run build:editor-main
npm run build:editor-renderer
npm run lint
npm test
npm --workspace axon run build
npm --workspace axon run dist:mac
npm --workspace axon run dist:win
npm --workspace axon run dist:linux
```

For Go backend work:

```bash
cd services/core
go test ./...
```

## Validation Before A Pull Request

Run the smallest validation that covers your change, then mention exactly what
you ran in the PR.

- Shared package changes: `npm run build:packages`
- Electron main/preload changes: `npm run build:editor-main`
- Renderer/editor changes: `npm run build:editor-renderer`
- TypeScript/React changes: `npm run lint` and `npm --workspace axon test`
- Full app packaging logic: `npm --workspace axon run build`
- Core service or terminal backend changes: `go test -race ./...` and
  `go vet ./...` from `services/core`
- File-size enforcement: `npm run check:line-count`

CI runs package validation, editor build checks, and Go tests on push. Do not
rely on CI as the first time a changed area is compiled locally.

## Architecture Rules

- Keep built-in features extension-owned where possible. If a feature is a
  first-party surface, prefer `extensions/builtin/<feature>` for its workbench
  ownership and manifest.
- Keep reusable editor/platform behavior out of leaf UI components. Shared
  helpers should live in the appropriate `lib`, platform, service, or package
  folder.
- Keep Electron main-process work in main/service boundaries. Renderer
  components should not become hidden owners of process, watcher, or filesystem
  lifecycle.
- Keep terminal/session reliability changes split between UI scheduling,
  platform transport, and `services/core` PTY/session ownership.
- Keep theme and syntax-coloring changes connected to the built-in theme data
  and the token-coloring architecture in `docs/TOKEN_COLORING_ARCHITECTURE.md`.
- Avoid adding large files that mix many unrelated UI functions, state machines,
  and helpers. Split by ownership and responsibility.

## Code Style

- Comments should explain why code exists, what problem it prevents, and what
  edge case it protects. Do not add comments that only repeat the code.
- Avoid commented-out code in commits.
- Avoid stray `console.log`, `fmt.Println`, or `print()` debugging output.
  Purposeful CLI output and explicit diagnostics are fine.
- Prefer explicit error handling. Do not hide failures that would make startup,
  workspace switching, terminal sessions, or LSP behavior harder to debug.
- Prefer existing local patterns and helpers over introducing new abstractions.
- Keep unrelated formatting churn out of focused changes.

## Commit Message Format

Use Conventional Commit style with a detailed body:

```text
feat|fix|refactor|perf|docs|test|chore: short imperative summary

- Specific thing that changed or was added
- Another specific thing
- Important implementation detail
- Validation, regression note, or follow-up risk if relevant
```

Examples:

```text
fix: keep git paints fresh in packaged builds

- Add a Git-only heartbeat when the active workspace has Git metadata
- Preserve immediate folder and .git watcher events for quick updates
- Keep the fallback scoped to Git status instead of full workspace polling
- Clear the heartbeat with the watcher lifecycle during workspace switches
```

```text
docs: document token coloring architecture

- Explain why Monaco's default token pipeline was not enough for Axon
- Document the TextMate, semantic-token, and decoration layers
- Link the architecture to the upstream Monaco issue that shaped the design
```

## Pull Requests

- Keep each PR scoped to one clear purpose.
- Reference the related issue or discussion when one exists.
- Explain what changed, why it changed, and how it was validated.
- Include screenshots or short recordings for visible UI changes.
- Mention known limitations, follow-up work, or platform-specific risk.
- Do not include ignored local notes, screenshots, temporary files, or generated
  release output unless the change explicitly requires them.

## Release Notes

User-facing changes should update:

- `CHANGELOG.md`
- The matching file under `docs/releases/` when preparing a release
- `README.md` only when the public docs, latest release link, setup, or project
  behavior changes

Version bumps should match the public release being prepared. Do not create a
new version number just because package metadata is ahead of the latest release
notes.

## Reporting Bugs

Open an issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Axon version
- OS and CPU architecture
- Whether the issue happens in dev, packaged builds, or both
- Relevant logs, screenshots, or console errors

For terminal, watcher, LSP, Git, and workspace-switching bugs, include the
project type and whether the workspace is inside a Git repository.

## Questions

Open a discussion or issue. Clear questions are useful, especially when they
surface architecture or workflow gaps before code is written.
