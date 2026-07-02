# Axon Architecture

Axon is moving from a compact Electron app layout into a production IDE layout
with explicit ownership boundaries. The goal is not to mirror another editor's
folder names exactly. The goal is to make every part of Axon have a clear home:
the desktop shell, reusable platform services, backend services, shared
protocols, and extension-contributed product features.

## Previous Layout

The first layout was optimized for speed of development:

```text
axon/
├── editor/
│   └── src/
│       ├── main/
│       ├── preload/
│       └── renderer/
│           ├── app/
│           ├── features/
│           └── shared/
├── services/core/
├── packages/extension-api/
└── extensions/
```

That shape worked while Axon was still mostly one app. It kept the Electron
main process, preload bridge, React shell, editor features, and shared renderer
helpers close together.

The problem is that an IDE grows through independent subsystems. Terminal,
language tools, source control, themes, icons, settings, search, agent surfaces,
and future extensions should not all live as peer folders under one renderer
tree. That makes ownership unclear, encourages cross-feature imports, and makes
it harder to turn built-in features into real extensions.

## Current Layout

The repository now separates application, backend service, shared packages, and
extensions:

```text
axon/
├── apps/
│   └── editor/
│       └── src/
│           ├── main/
│           ├── preload/
│           ├── platform/
│           ├── workbench/
│           └── renderer/
├── services/
│   └── core/
├── packages/
│   ├── extension-api/
│   ├── protocol/
│   ├── ipc/
│   └── config/
├── extensions/
│   ├── builtin/
│   └── marketplace/
├── build/
├── tools/
└── docs/
```

This is the start of the production layout. Some renderer modules still remain
under `apps/editor/src/renderer` while they are migrated into `workbench` and
`platform` in smaller, buildable slices.

## Ownership

### `apps/editor`

The Electron desktop app lives here. It owns the application shell and desktop
integration, but it should not become the long-term home for every product
feature.

`src/main` owns Electron main-process work: native windows, app lifecycle, IPC
handlers, updater integration, filesystem bridges, extension discovery, and
language-server process management.

`src/preload` owns the safe bridge exposed to the renderer. Renderer code should
talk through this bridge instead of reaching into Node or Electron directly.

`src/workbench` owns the visible IDE shell and built-in UI contributions. The
workbench is where panes, panels, command surfaces, and contributed UI fit
together into the editor experience.

`src/workbench/app` owns the top-level editor shell. It coordinates layout,
workspace state, panes, command routing, modals, sidebars, panels, and global
state that exists because the full application exists.

`src/workbench/contrib` owns built-in UI contributions. Terminal and Extensions
have moved here first because they are already represented as extension
contributions and need clear boundaries before heavier features are migrated.

`src/platform` owns reusable client-side services that are not one specific UI
feature. Terminal protocol helpers and terminal theme resolution live here
because other workbench contributions can use them without importing a terminal
component.

`src/renderer` is now the remaining renderer module area. It still contains
features and UI helpers that predate the split. The direction is to migrate
feature UI into `workbench/contrib` and reusable services into `platform`.

### `services/core`

The Go service owns local backend capabilities that should not run inside the
renderer. This includes filesystem operations, search, PTY-backed terminal
sessions, local server routes, and agent-facing backend behavior.

The terminal architecture intentionally splits responsibilities:

- The workbench terminal contribution owns the visible terminal UI.
- The platform terminal helpers own client-side protocol and presentation
  helpers.
- The Go core owns PTY lifecycle, shell process ownership, stream replay, and
  websocket transport.

That split prevents a React component from being responsible for process
lifetime and prevents backend PTY code from knowing about UI layout.

### `packages`

Shared packages are contracts. They are used to keep app code, backend-facing
code, and future extension tooling from inventing separate definitions for the
same behavior.

`packages/extension-api` owns extension manifests, contribution types, registry
types, runtime-facing extension contracts, and validation helpers.

`packages/protocol` owns shared wire protocol shapes, starting with terminal
control and replay constants.

`packages/ipc` owns shared IPC channel names so the main process and preload
bridge cannot drift apart.

`packages/config` owns shared repository and extension path conventions.

### `extensions`

Extensions are product packages. Built-in extensions live under
`extensions/builtin`, and downloadable local marketplace examples live under
`extensions/marketplace`.

Built-in themes and icons already use this layout. Terminal, agent, Git,
problems, testing, markdown, and language packages also have manifests so their
commands, views, languages, agents, and terminal profiles can be registered
through the extension host instead of being hard-coded forever in the app shell.

The app should increasingly consume extension contributions through the
extension host registry. That is how built-in features and third-party packages
can eventually follow the same model.

### `build`

Repository-level build orchestration lives here. App-specific build scripts can
stay inside `apps/editor/scripts`, but shared workspace build behavior belongs
at the root so it can serve all apps, packages, and future tooling.

### `tools`

Repository maintenance tools live here. These scripts are not product runtime
code. They enforce project health and make future migrations safer.

## Why This Migration Matters

The old layout made it too easy for features to depend on each other through
relative imports and shared renderer state. That is manageable in a small app,
but it becomes fragile in an IDE.

The new layout creates architectural pressure in the right direction:

- Product features move toward extension contributions.
- Shared contracts move into packages.
- UI shell code moves into workbench.
- Reusable client services move into platform.
- Backend process and PTY ownership stays in services/core.
- Repo-wide build and maintenance logic moves out of the editor app.

This gives Axon a path to support a real extension host, downloadable
extensions, built-in features with clear ownership, and backend services that
can evolve without being coupled to React component structure.

## Migration Direction

The migration is incremental because every step should keep the app buildable.
The current target is:

```text
apps/editor/src/workbench/contrib/
├── agent/
├── editor/
├── extensions/
├── git/
├── problems/
├── search/
├── settings/
├── terminal/
└── testing/
```

Reusable code should move toward:

```text
apps/editor/src/platform/
├── extensions/
├── ipc/
├── storage/
├── terminal/
├── themes/
└── workspace/
```

Shared contracts that must be consumed outside the editor app should move
toward `packages/*`, not deeper into `apps/editor`.

The final shape should make it obvious where a change belongs before a developer
opens a file. That is the standard this migration is aiming for.

## Built-In Terminal Migration

The terminal feature is now split by production ownership instead of being
treated as a single renderer folder:

- `extensions/builtin/terminal/axon.extension.json` declares the terminal
  commands, panel view, activation events, and default profile.
- `extensions/builtin/terminal/workbench` owns the built-in terminal workbench
  implementation that renders the panel contribution.
- `apps/editor/src/workbench` hosts contributed workbench surfaces and reads the
  extension contribution registry before mounting the terminal.
- `apps/editor/src/platform/terminal` owns reusable terminal protocol, theme,
  websocket, and xterm integration helpers that are shared by the workbench
  contribution.
- `services/core/internal/terminal` remains the backend owner of PTY process
  lifecycle, replay, acknowledgements, and websocket transport.

This is the boundary Axon should keep using for built-in IDE features. The app
shell can host and coordinate, but new feature implementation should move under
its built-in extension when the feature has a clear product boundary. Shared
contracts stay in `packages/*` or `apps/editor/src/platform/*`; backend runtime
stays in `services/core`.
