# Axon

<p align="center">
  <img src="apps/editor/src/renderer/public/axon.png" width="80" height="80" alt="Axon" />
</p>

Axon is a personal AI-powered code editor built with Electron, React, TypeScript,
Monaco, and a Go backend. It is built for day-to-day coding first: files,
panes, terminal, Git, search, settings, previews, and language-server support.

## Preview

**Quick look**

<p align="center">
  <video src="docs/media/axon-demo-preview.mp4" autoplay muted loop playsinline width="760">
    Axon workspace preview.
  </video>
</p>

**Full demo**

<p align="center">
  <video src="docs/media/axon-demo-full.mp4" controls width="760">
    Axon demo recording.
  </video>
</p>

**Screenshots**

<table>
  <tr>
    <td colspan="3" align="center"><strong>Workspace Workflows</strong></td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-01.png" alt="Axon editor with file tree and tabs" width="260" /><br />
      <sub>Editor, file tree, and tabs</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-02.png" alt="Axon workspace picker" width="260" /><br />
      <sub>Workspace picker</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-03.png" alt="Axon clone repository workflow" width="260" /><br />
      <sub>Clone repository</sub>
    </td>
  </tr>
  <tr>
    <td colspan="3" align="center"><strong>Editing and Intelligence</strong></td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-04.png" alt="Axon language hover documentation" width="260" /><br />
      <sub>Language hover</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-05.png" alt="Axon code completion suggestions" width="260" /><br />
      <sub>Code completion</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-06.png" alt="Axon Problems view" width="260" /><br />
      <sub>Problems view</sub>
    </td>
  </tr>
  <tr>
    <td colspan="3" align="center"><strong>Git and Project Feedback</strong></td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-07.png" alt="Axon source control panel" width="260" /><br />
      <sub>Source control</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-08.png" alt="Axon inline source control diff" width="260" /><br />
      <sub>Inline diff</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-09.png" alt="Axon project output panel" width="260" /><br />
      <sub>Project output</sub>
    </td>
  </tr>
  <tr>
    <td colspan="3" align="center"><strong>Commands and Workspace Safety</strong></td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-10.png" alt="Axon quick actions menu" width="260" /><br />
      <sub>Quick actions</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-11.png" alt="Axon file tree actions" width="260" /><br />
      <sub>File tree actions</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-12.png" alt="Axon workspace trust confirmation" width="260" /><br />
      <sub>Workspace trust</sub>
    </td>
  </tr>
  <tr>
    <td colspan="3" align="center"><strong>Language Intelligence Details</strong></td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-13.png" alt="Axon inline completion details" width="260" /><br />
      <sub>Inline completion details</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-14.png" alt="Axon filtered completion suggestions" width="260" /><br />
      <sub>Filtered suggestions</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-15.png" alt="Axon function signature information" width="260" /><br />
      <sub>Function signatures</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-16.png" alt="Axon package documentation hover" width="260" /><br />
      <sub>Package documentation</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-17.png" alt="Axon empty editor workspace" width="260" /><br />
      <sub>Empty editor</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-18.png" alt="Axon focused editor workspace" width="260" /><br />
      <sub>Focused workspace</sub>
    </td>
  </tr>
  <tr>
    <td colspan="3" align="center"><strong>Application Menus</strong></td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/media/axon-screenshot-19.png" alt="Axon application menu" width="260" /><br />
      <sub>Application menu</sub>
    </td>
    <td align="center">
      <img src="docs/media/axon-screenshot-20.png" alt="Axon create menu" width="260" /><br />
      <sub>Create menu</sub>
    </td>
    <td></td>
  </tr>
</table>

## Stack

**Editor**

- Electron desktop shell
- React, TypeScript, Tailwind CSS
- Monaco Editor
- xterm.js terminal

**Core**

- Authenticated `axon-core` service for file system, search, Git, and local AI
  runtime routes
- Isolated `axon-pty-host` process for shell ownership, replay, and terminal
  streaming
- Private Unix socket or Windows named-pipe control plane for packaged terminal
  sessions, with a separate authenticated loopback WebSocket data stream

## Project Structure

See the [Architecture Guide](architecture.md) for the full repository
architecture, ownership boundaries, and migration direction.

```text
axon/
├── package.json                  # npm workspace root for editor and shared packages
├── build/                        # repo-level build orchestration
├── tools/                        # repo maintenance and guardrail scripts
├── services/
│   └── core/                     # Go backend
│       ├── cmd/axon/             # backend entry point
│       ├── cmd/axon-pty-host/    # isolated PTY process entry point
│       ├── cmd/axon-agent/       # terminal agent command installed as axon
│       └── internal/
│           ├── fs/               # file tree, text reads, writes, search
│           ├── server/           # HTTP routes
│           ├── ptyhost/          # private control and terminal stream routers
│           ├── terminal/         # PTY sessions, replay, and acknowledgements
│           └── ai/               # model discovery, project context, and streaming chat
├── packages/
│   ├── extension-api/            # manifest, registry, and runtime extension contracts
│   ├── protocol/                 # shared wire protocol contracts
│   ├── ipc/                      # shared IPC channel contracts
│   └── config/                   # shared repository and extension path conventions
├── extensions/                   # built-in and marketplace extension packages
│   ├── builtin/
│   └── marketplace/
├── examples/                     # extension manifests, themes, and runtime API usage
├── apps/
│   └── editor/                   # Electron + React app
│       └── src/
│           ├── main/             # Electron main process, IPC, updater, LSP
│           ├── platform/         # reusable renderer/client services
│           ├── preload/          # safe contextBridge API
│           ├── workbench/        # editor shell and built-in UI contributions
│           └── renderer/         # editor, sidebar, onboarding, and shared UI features
└── docs/                         # release, update, and language-tool notes
```

## Run Locally

Prerequisites: Node.js 22, npm 10 or newer, Go 1.25.1 or newer, and Git.

```bash
npm install
npm run dev
```

In development, `npm run dev` starts the Go core, Vite renderer, and Electron
shell together. Packaged builds include the Go core binary and start it
automatically.

## Build

```bash
npm run build
npm --workspace axon run pack
```

Platform packages:

```bash
npm --workspace axon run dist:mac
npm --workspace axon run dist:win
npm --workspace axon run dist:linux
```

Build output goes to `apps/editor/release/`.

## Extension Examples

Start with the [Extension Examples](examples/README.md). The repository
includes:

- a theme extension that can be loaded from `.axon/extensions/` today;
- a language metadata, configuration, and snippet manifest example;
- a type-checked `activate(context, api)` example covering commands, terminal
  profiles, debug configuration, workspace indexing, and disposal.

The public contract lives in the
[Extension API](packages/extension-api/README.md). Declarative user
and workspace extensions are supported. Executable third-party modules remain
disabled until Axon can run them in an isolated extension-host process; trusted
built-ins currently exercise that runtime contract. `window.axon` is an
internal preload bridge and is not a public extension API.

## Downloads

Use the file that matches your platform and CPU:

- macOS Apple Silicon: `Axon-<version>-arm64.dmg`
- macOS Intel: `Axon-<version>.dmg`
- Windows: `Axon.Setup.<version>.exe`
- Linux AppImage: `Axon-<version>.AppImage`
- Linux Debian/Ubuntu: `axon_<version>_amd64.deb`

If macOS says the app is not supported, the downloaded build probably does not
match your CPU architecture.

## Updates

Axon checks GitHub releases for newer versions. On unsigned personal macOS
builds, fully automatic in-app replacement is not guaranteed because macOS
Gatekeeper and Electron updater flows expect signed/notarized apps for the
smoothest install-and-relaunch path. For that reason, the safest update path is:

1. Open the update notice in Axon.
2. Download the correct release artifact for your platform.
3. Replace the old app manually if the in-app updater cannot relaunch.

Windows and Linux builds do not require Apple notarization, but releases still
need to be tested on their target platform before being treated as stable.

More detail: [Update Guide](docs/UPDATES.md).

## Current Features

See [Current Features](docs/CURRENT_FEATURES.md) for the complete feature list.

## Language Servers

Axon does not reimplement language intelligence itself. Like Zed and VS Code, it
acts as an LSP client and talks to language servers.

Currently targeted:

- TypeScript/JavaScript: bundled `typescript-language-server`
- Go: bundled managed `gopls`
- Python: bundled `pyright-langserver`
- PHP: bundled `intelephense`
- HTML, CSS, JSON, YAML, Docker, Bash, and web frameworks: bundled npm servers
- C/C++, Rust, Java, C#, Kotlin, Lua, XML, Protocol Buffers, Dart, SQL,
  TOML, Zig, Terraform, LaTeX, Clojure, Haskell, Erlang, and Assembly:
  installed on demand from Language Tools
- Swift, Ruby, Scala, R, PowerShell, and Makefile: detected automatically and
  installed or connected through their supported runtime toolchains

Release builds package npm-backed servers and Go. Other native servers, SDKs,
and private runtimes are downloaded only when the user installs their language
from Axon's Language Tools. Downloads are version-pinned, integrity-checked,
staged outside the active installation, and cleaned up when cancelled or failed.
This keeps the desktop installer smaller without removing syntax highlighting
or workspace language detection.

More detail: [Language Server Guide](docs/LANGUAGE_SERVERS.md).

## Release Notes

See the [Changelog](CHANGELOG.md) for the full history and the
[v1.3.6 Release Notes](docs/releases/v1.3.6.md) for the latest release
notes.

## License

Axon is available under the [MIT License](LICENSE).

Copyright (c) 2026 GordenArcher and Axon Editor Group.

## Roadmap

- Reviewed AI patch preview/apply workflow
- Complete multi-root behavior across Git, LSP, terminals, tests, and agent context
- Additional hosted/local AI providers with secure credential storage
- Complete extension contribution activation and replace the temporary asset mirror
- Test coverage, test debugging, advanced Git review, and deeper LSP features
