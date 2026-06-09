# Axon — Architecture Notes

> Covers: proposed folder structure refactor, LSP bug diagnosis & fix, terminal
> bug diagnosis & VSCode/Zed architecture comparison.
> Based on a full read of the codebase at commit `e3ed3e4` (feat: build full git history editor view).

---

## 1. Proposed Folder Structure

### Monorepo root

```
axon/
├── .github/workflows/release.yml
├── core/                          # Go backend
├── docs/
└── editor/                        # Electron app
    ├── scripts/
    ├── build/
    ├── public/
    ├── extensions/
    └── src/
        ├── shared/                # IPC contracts (main ↔ renderer)
        ├── preload/
        ├── main/                  # Electron main process (refactored)
        └── renderer/              # React UI (refactored)
```

### `src/main/` — before vs after

**Before:** one `index.ts` at 5,217 lines covering every domain.

**After — feature-based modules:**

```
src/main/
├── index.ts               # App lifecycle, protocol, menu wiring only
├── core/
│   ├── process.ts         # start/stop/watchdog for bundled axon-core binary
│   └── ipc.ts             # sendToRenderer, sendMenuCommand
├── window/
│   ├── createWindow.ts    # BrowserWindow factory, icon, navigation guard
│   └── menu.ts            # buildApplicationMenu, buildViewMenu
├── settings/
│   ├── paths.ts           # getUserSettingsPath, getWorkspaceSettingsPath
│   ├── io.ts              # readSettingsFromDisk, writeSettingsToDisk
│   └── handlers.ts        # ipcMain: settings:get, settings:set
├── lsp/
│   ├── definitions.ts     # LANGUAGE_SERVER_DEFINITIONS array + types
│   ├── session.ts         # LSP process lifecycle, stdio framing
│   ├── features.ts        # completions, hover, definitions, rename, format
│   └── handlers.ts        # ipcMain: lsp:*
├── git/
│   ├── git.ts             # runGit, getGitStatus, getGitDiff, runGitAction
│   └── handlers.ts        # ipcMain: git:*
├── tasks/
│   ├── tasks.ts           # getWorkspaceTasks, startWorkspaceTask
│   └── handlers.ts        # ipcMain: tasks:*
├── fs/
│   ├── watcher.ts         # activeWatcher, folderWatcher, gitWatcher
│   └── handlers.ts        # ipcMain: fs:watch, fs:watchFolder
├── htmlPreview/
│   ├── server.ts          # HTTP server, SSE, file serving
│   ├── inject.ts          # client script injection into HTML
│   └── handlers.ts        # ipcMain: htmlPreview:*
├── diagnostics/
│   ├── diagnostics.ts     # runProjectDiagnostics, parsers
│   └── handlers.ts        # ipcMain: diagnostics:project
├── updates/
│   ├── updater.ts         # configureAutoUpdater, checkForAppUpdate
│   └── handlers.ts        # ipcMain: app:checkForUpdates, app:downloadUpdate
├── fonts/
│   └── fonts.ts           # importCustomFontFile, getCustomFontsDirectory
└── extensions/            # (already exists)
    ├── loader.ts
    ├── paths.ts
    └── themeNormalizer.ts
```

**Rule for `handlers.ts` files:** IPC wiring only — imports from the sibling logic
file and registers `ipcMain.handle` calls. The logic files contain zero IPC
knowledge. `index.ts` shrinks to app lifecycle + importing all handler modules.

### `src/renderer/` — before vs after

**Before:** flat `components/` directory with no feature ownership.

**After — `features/` with co-located `lib/`:**

```
src/renderer/
├── main.tsx                         # React root mount only
├── App.tsx                          # Layout shell, composes features
│
├── features/
│   ├── editor/
│   │   ├── EditorPane.tsx           # Pane container + split layout
│   │   ├── PaneInstance.tsx
│   │   ├── SingleEditor.tsx         # Monaco editor wrapper
│   │   ├── EmptyPane.tsx
│   │   ├── WorkspaceBlankPane.tsx
│   │   ├── PaneDivider.tsx
│   │   ├── EditorToolbar.tsx
│   │   ├── TabBar.tsx
│   │   ├── ChromeTab.tsx
│   │   └── lib/
│   │       ├── types.ts             # Pane, Layout, SplitDirection
│   │       ├── layoutManager.ts
│   │       ├── monacoModels.ts
│   │       ├── dragData.ts
│   │       └── navigation.ts
│   │
│   ├── sidebar/
│   │   ├── index.tsx                # Sidebar shell
│   │   └── files/
│   │       ├── FileTree.tsx
│   │       ├── FileTreeNode.tsx
│   │       ├── InlineCreateRow.tsx
│   │       ├── ContextMenu.tsx
│   │       ├── FolderPicker.tsx
│   │       └── lib/
│   │           ├── fileIcons.tsx
│   │           ├── fileSymbols.ts
│   │           └── catppuccinIconMappings.ts
│   │
│   ├── terminal/
│   │   ├── Terminal.tsx
│   │   └── BottomPanel.tsx
│   │
│   ├── search/
│   │   ├── CommandPalette.tsx
│   │   ├── WorkspaceSearchModal.tsx
│   │   ├── FileOutlineModal.tsx
│   │   └── SearchSelect.tsx
│   │
│   ├── git/
│   │   ├── SourceControlModal.tsx
│   │   ├── DiffModal.tsx
│   │   └── lib/
│   │       └── gitDiffDecorations.ts
│   │
│   ├── preview/
│   │   ├── HtmlPreview.tsx
│   │   ├── MarkdownPreview.tsx
│   │   ├── MediaPreview.tsx
│   │   └── lib/
│   │       └── htmlPreviewTabs.ts
│   │
│   ├── lsp/
│   │   └── lib/
│   │       ├── lspCompletions.ts
│   │       ├── lspNavigation.ts
│   │       └── monacoDiagnostics.ts
│   │
│   ├── diagnostics/
│   │   └── lib/
│   │       └── diagnostics.ts
│   │
│   ├── settings/
│   │   ├── SettingsModal.tsx
│   │   ├── SettingsControls.tsx
│   │   └── settingsData.ts
│   │
│   ├── extensions/
│   │   └── ExtensionsModal.tsx
│   │
│   ├── tasks/
│   │   └── TaskRunnerModal.tsx
│   │
│   └── updates/
│       └── UpdateModal.tsx
│
└── shared/                          # Cross-feature, owned by no single feature
    ├── components/
    │   ├── CommandModal.tsx
    │   ├── Tooltip.tsx
    │   ├── StatusBar.tsx
    │   ├── SplashScreen.tsx
    │   ├── WorkspaceLoadingOverlay.tsx
    │   └── AboutModal.tsx
    ├── lib/
    │   ├── api.ts
    │   ├── coreBackend.ts
    │   ├── workspaceSession.ts
    │   ├── assets.ts
    │   ├── fonts.ts
    │   ├── bundledFonts.ts
    │   └── themeTokens.ts
    └── themes/
        ├── index.ts
        ├── types.ts
        ├── axonDark.ts
        ├── ayuDark.ts
        ├── catppuccinMocha.ts
        ├── zedDark.ts
        └── sora.ts
```

**Placement rule:** a file lives as close as possible to the feature that owns it.
If two unrelated features both need it, it moves up to `shared/`. Nothing in
`shared/` knows about any specific feature.

---

## 2. LSP Bug — Go / Rust / Python / C++ completions not working

### Confirmed from code

#### Bug A — Binaries not packaged into the DMG (root cause, confirmed on disk)

Running `ls` on the installed app:

```
ls: /Applications/Axon.app/Contents/Resources/language-servers/darwin-arm64/go/bin/: No such file or directory
```

The directory doesn't exist. The `build/language-servers/` folder is git-ignored
and only populated by `npm run build:language-servers`. In the GitHub Actions
workflow, this step runs before `electron-builder`, which is correct order. But
if the step fails for any reason — network error, module proxy issue, Go not
resolving `gopls` — the workflow has no `continue-on-error: true`, so the whole
job would fail and no DMG is produced. However if the script partially succeeded
and the directory was empty or incomplete, `electron-builder` would still
package an empty `language-servers/` folder and produce a DMG with no binaries
inside.

**Why TS/JS/PHP work:** they use `bundledNodeServer` — their executables live
inside `node_modules/`, which is always present because `npm ci` runs before
packaging. They don't depend on the download script at all.

**Why Go/Rust/Python/C++ don't work:** they use `managedBundle`, which resolves
to `process.resourcesPath + "/language-servers/{platform}-{arch}/{lang}/bin/{exe}"`.
If that path doesn't exist, `resolveManagedLanguageServer` returns `null`, and
the fallback is the plain system command (`"gopls"`, `"rust-analyzer"`, etc.).
`canRunCommand` then checks if that string is an absolute path — it isn't — and
returns `false`. The server is marked `missing` and never starts.

#### Bug B — `initialize` timeout too short (7 seconds)

Even if the binaries were present, there is a second bug. `initializeLanguageServer`
calls `requestLanguageServer` with a hardcoded `7000`ms timeout:

```ts
// src/main/index.ts line 2293
void requestLanguageServer(session, "initialize", { ... }, 7000)
```

When gopls or rust-analyzer receives `initialize` on a cold workspace, they
index the full module graph before responding. On a real project this takes
15–40 seconds. The 7-second timer fires, rejects the promise, and
`session.initialized` never gets set to `true`.

After that, every completion/hover/definition request hits this check:

```ts
// line 2786
if (!session.initialized) {
  return { ok: false, message: "still starting.", session: null };
}
```

The server process is alive and running — it's in `activeLanguageServers` — but
every request returns empty forever. The `.catch` on `initializeLanguageServer`
logs to stderr and moves on with no retry, so the session is permanently broken.

**Why TS/JS/PHP are not affected:** `typescript-language-server` and `intelephense`
respond to `initialize` in under a second — they don't index upfront.

### The fix

**Step 1 — Fix the CI packaging (the actual blocker)**

Add verification to the workflow so a failed or empty download is caught before
packaging:

```yaml
- name: Bundle managed language servers
  run: npm run build:language-servers
  env:
    GITHUB_TOKEN: ${{ github.token }}

# Add this step immediately after
- name: Verify language server bundles
  shell: bash
  run: |
    PLATFORM=$(node -e "const p=process.platform,a=process.arch; console.log(p+'-'+a)")
    echo "Checking language-servers/$PLATFORM"
    ls -la build/language-servers/$PLATFORM/
    # Fail the job if gopls binary is missing
    test -f build/language-servers/$PLATFORM/go/bin/gopls || (echo "gopls binary missing" && exit 1)
```

**Step 2 — Bump the `initialize` timeout**

```ts
// In initializeLanguageServer — remove the 7000 hardcode.
// gopls and rust-analyzer index the workspace before responding.
// 120 seconds is a safe upper bound; real world is 10-40s on a large project.
void requestLanguageServer(session, "initialize", { ... }, 120_000)
```

**Step 3 — Add retry on initialize failure**

```ts
.catch((err) => {
  session.stderr = `${session.stderr}\n${err.message}`.slice(-4000);
  emitLanguageServerLog(session, "error", err.message);
  // Don't leave the session permanently broken — the process is still alive.
  // Retry initialization after a short backoff.
  if (!session.disposed) {
    setTimeout(() => initializeLanguageServer(session), 2000);
  }
});
```

---

## 3. Terminal Bug — Disconnects on idle

### What Axon currently does

```
Renderer (xterm.js) → WebSocket → TCP → HTTP (axon-core Go server) → PTY
```

There are two process boundaries and a full TCP stack between the UI and the
shell. Any idle TCP timeout, NAT keepalive window, OS socket cleanup, or laptop
sleep/wake tears the WebSocket connection.

### Bugs confirmed from code

#### Bug A — No WebSocket keepalive

The gorilla/websocket `Handler` in `core/internal/terminal/terminal.go` has no
`SetPongHandler`, no `SetReadDeadline` refresh, and no server-side ping ticker.
The client (`Terminal.tsx`) sends no pings either. After ~30–60 seconds of
idle input, the OS TCP stack, NAT table, or any proxy in between silently drops
the connection. The WebSocket `onclose` fires, the 1-second reconnect timer
triggers a new connection, and the replay cursor (`replayFrom`) tries to resume
from where it left off.

#### Bug B — `receivedBytes` / `totalBytes` mismatch on reconnect

`Terminal.tsx` tracks received output with:

```ts
currentSession.receivedBytes += getOutputByteLength(event.data);
```

`getOutputByteLength` re-encodes the JS string through `TextEncoder` to count
bytes. But the backend sends `websocket.TextMessage`, meaning the browser
WebSocket stack decodes the raw bytes into a DOMString before `onmessage` fires.
Terminal escape sequences frequently contain raw bytes that are not valid UTF-8.
The browser may corrupt or drop bytes during that decode, so `receivedBytes` on
the frontend drifts from `totalBytes` on the backend. On reconnect, `replayFrom`
is wrong and the backend either re-sends duplicate output or skips content,
producing a flash or garbage in the terminal.

### Immediate fixes (patch-level)

These are temporary fixes on the current WebSocket architecture.

**1. Add ping/pong keepalive in `terminal.go`**

```go
ws.SetReadDeadline(time.Now().Add(60 * time.Second))
ws.SetPongHandler(func(string) error {
    ws.SetReadDeadline(time.Now().Add(60 * time.Second))
    return nil
})

pingTicker := time.NewTicker(20 * time.Second)
defer pingTicker.Stop()
go func() {
    for range pingTicker.C {
        ws.WriteControl(
            websocket.PingMessage,
            nil,
            time.Now().Add(5*time.Second),
        )
    }
}()
```

**2. Switch to `BinaryMessage` in `client.write`**

```go
// PTY output is raw bytes, not UTF-8 text.
// BinaryMessage prevents the browser WebSocket from misinterpreting
// escape sequences during decode.
func (client *terminalClient) write(data []byte) error {
    client.mu.Lock()
    defer client.mu.Unlock()
    return client.ws.WriteMessage(websocket.BinaryMessage, data)
}
```

**3. Fix `receivedBytes` tracking in `Terminal.tsx`**

```ts
ws.binaryType = "arraybuffer";

ws.onmessage = (event) => {
    const data = event.data as ArrayBuffer | string;
    currentSession.receivedBytes +=
        data instanceof ArrayBuffer
            ? data.byteLength
            : new TextEncoder().encode(data).length;
    currentSession.term?.write(
        data instanceof ArrayBuffer ? new Uint8Array(data) : data,
    );
};
```

xterm.js `write()` accepts `Uint8Array` directly. Byte count is now exact on
both ends, so the replay cursor on reconnect is trustworthy.

---

## 4. Terminal — Why VSCode and Zed never disconnect

### VSCode architecture

VSCode does not use WebSocket for the terminal. The PTY runs inside a dedicated
`ptyHost` — a separate Node.js `UtilityProcess` (Electron's sandboxed process
type). The renderer communicates with it through **Electron `MessagePort`** — a
direct in-process memory channel. There is no TCP layer, no HTTP, no socket
crossing a network boundary. A `MessagePort` physically cannot "disconnect"
unless the host process crashes.

The heartbeat system VSCode ships is not for keepalive — it is for detecting
if the `ptyHost` process has become **unresponsive or crashed**, so it can
restart it and revive terminal sessions automatically:

```ts
// vscode: src/vs/platform/terminal/common/terminal.ts
export enum HeartbeatConstants {
    BeatInterval = 5000,           // check every 5s
    ConnectingBeatInterval = 20000 // slower while ptyHost is starting
}
```

The communication stack is:

```
Renderer → MessagePort → ptyHost (UtilityProcess) → node-pty → PTY
```

Everything is in-process memory. No TCP, no idle timeouts, no NAT.

### Zed architecture

Zed is a native Rust app. The PTY lives in the same process, communicated
through `async_channel` (Rust mpsc). It is a pipe between threads in the same
process. There is no network boundary at all.

### The gap in Axon

Axon's architecture:

```
Renderer (xterm.js) → WebSocket → TCP → Go HTTP server → PTY
```

Every reliability problem with the terminal traces back to this TCP hop. The
patch-level fixes (ping/pong, binary frames) reduce disconnects but don't
eliminate the fundamental fragility of TCP for a live PTY session.

### Correct long-term architecture for Axon

Move PTY ownership into the Electron main process using `node-pty`, and
communicate with the renderer over `ipcMain`/`ipcRenderer`:

```
Renderer (xterm.js) → ipcRenderer → ipcMain → node-pty → PTY
```

This matches VSCode's model — no TCP, no WebSocket, no idle timeout possible.
The Go `axon-core` backend is still used for filesystem, AI, and HTTP preview,
but the terminal is decoupled from it and lives natively in Electron.

**Migration steps:**

1. Add `node-pty` to `editor/package.json` as a native dependency.
2. Add `node-pty` to `asarUnpack` in the electron-builder config so the native
   `.node` binary is not packed inside the asar archive where it can't be loaded.
3. Create `src/main/terminal/pty.ts` — owns the `pty.spawn` call, manages
   active sessions by `sessionId`, handles resize.
4. Create `src/main/terminal/handlers.ts` — `ipcMain.handle` for
   `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:kill`.
   Uses `webContents.send` to push output to the renderer.
5. Update `src/renderer/features/terminal/Terminal.tsx` — replace all WebSocket
   code with `window.axon.terminalCreate/Write/Resize/Kill` IPC calls and an
   `ipcRenderer.on("terminal:output", ...)` listener.
6. Remove the WebSocket terminal handler from `core/internal/terminal/`.

The result: a terminal that is as stable as the OS process table, with zero
reconnect logic needed.
