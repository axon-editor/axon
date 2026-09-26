/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { resetCommandHistoryForTests } from "../../../../../extensions/builtin/terminal/workbench/lib/commandHistoryStore";
import { useTerminalSessionManager } from "../../../../../extensions/builtin/terminal/workbench/lib/useTerminalSessionManager";

const terminalBridgeMock = vi.hoisted(() => ({
  createTerminalTicket: vi.fn(),
  getTerminalCommandHistory: vi.fn(),
  openExternalLink: vi.fn(),
}));

const webLinksAddonMock = vi.hoisted(() => ({
  handlers: [] as Array<(event: MouseEvent, uri: string) => void>,
}));

const MOCK_CELL_WIDTH = 8;
const MOCK_CELL_HEIGHT = 17;

const xtermMock = vi.hoisted(() => ({
  focus: vi.fn(),
  handlers: {
    key: [] as Array<(event: { key: string }) => void>,
    write: [] as Array<() => void>,
  },
  // The suggestion controller reads the echoed line from the buffer, so the mock
  // needs a settable row and cursor instead of a frozen placeholder.
  row: "",
  cursorX: 0,
  instances: [] as Array<{
    customKeyEventHandler?: (event: KeyboardEvent) => boolean;
    element: HTMLElement | undefined;
    modes: { sendFocusMode: boolean };
    options: Record<string, unknown>;
  }>,
}));

function installBuffer(term: { buffer: unknown; cols: number; rows: number }) {
  const cell = { getWidth: () => 1 };
  term.buffer = {
    active: {
      type: "normal",
      baseY: 0,
      viewportY: 0,
      get cursorX() {
        return xtermMock.cursorX;
      },
      cursorY: 0,
      length: 24,
      // Only the cursor row carries text. A real terminal fills the rest of the
      // page with blank rows, and the controller refuses to treat a row with
      // content under it as a prompt.
      getLine: (y: number) => {
        const row = y === 0 ? xtermMock.row : "";
        return {
          isWrapped: false,
          length: row.length,
          getCell: (x: number) => (x < row.length ? cell : undefined),
          translateToString: (
            trimRight = false,
            startColumn = 0,
            endColumn = row.length,
          ) => {
            const text = row.slice(startColumn, endColumn);
            return trimRight ? text.replace(/\s+$/, "") : text;
          },
        };
      },
    },
  };
}

function installScreen(term: { element: HTMLElement | undefined }) {
  // The ghost text is positioned from the screen element's own pixel size, and
  // jsdom reports zero for every layout box, so the geometry is pinned to a
  // fixed cell size instead of being left to a real layout pass.
  const screen = document.createElement("div");
  screen.className = "xterm-screen";
  Object.defineProperty(screen, "clientWidth", {
    configurable: true,
    value: MOCK_CELL_WIDTH * 80,
  });
  Object.defineProperty(screen, "clientHeight", {
    configurable: true,
    value: MOCK_CELL_HEIGHT * 24,
  });
  const element = document.createElement("div");
  element.className = "xterm";
  element.appendChild(screen);
  // The suggestion overlay is only treated as shown while it is connected to the
  // document, so the fake terminal has to live in the tree like a real one.
  document.body.appendChild(element);
  term.element = element;
}

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    buffer = {
      active: { type: "normal", viewportY: 0, baseY: 0 },
    };
    cols = 80;
    rows = 24;
    modes = { sendFocusMode: true };
    options: Record<string, unknown>;
    customKeyEventHandler?: (event: KeyboardEvent) => boolean;
    element: HTMLElement | undefined;

    constructor(options: Record<string, unknown>) {
      this.options = { ...options };
      xtermMock.instances.push(this);
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      this.customKeyEventHandler = handler;
    }
    clear() {}
    dispose() {
      this.element?.remove();
    }
    focus() {
      xtermMock.focus();
    }
    loadAddon() {}
    open() {
      const target = this as unknown as {
        buffer: unknown;
        cols: number;
        element: HTMLElement | undefined;
        rows: number;
      };
      installBuffer(target);
      installScreen(target);
    }
    paste() {}
    refresh() {}
    scrollToBottom() {}
    scrollToLine() {}
    write() {}
    onData() {
      return { dispose() {} };
    }
    onScroll() {
      return { dispose() {} };
    }
    onCursorMove() {
      return { dispose() {} };
    }
    onWriteParsed(handler: () => void) {
      xtermMock.handlers.write.push(handler);
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
    onKey(handler: (event: { key: string }) => void) {
      xtermMock.handlers.key.push(handler);
      return { dispose() {} };
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
    proposeDimensions() {
      return { cols: 80, rows: 24 };
    }
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(handler: (event: MouseEvent, uri: string) => void) {
      webLinksAddonMock.handlers.push(handler);
    }
  },
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {},
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  binaryType = "";
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  close() {}
  send(data: string) {
    this.sent.push(data);
  }
}

class FakeResizeObserver {
  disconnect() {}
  observe() {}
}

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

interface TerminalHarnessProps {
  background?: string;
  commandSuggestions?: boolean;
  foreground?: string;
  open?: boolean;
  red?: string;
}

// The panel tests need the manager itself, not only the mounted xterm nodes.
let latestManager: ReturnType<typeof useTerminalSessionManager> | null = null;

function TerminalHarness({
  background = "#000000",
  commandSuggestions = true,
  foreground = "#ffffff",
  open = true,
  red = "#cd3131",
}: TerminalHarnessProps) {
  const manager = useTerminalSessionManager({
    activePanelTab: "terminal",
    commandSuggestions,
    createNonce: 0,
    createWorkingDirectory: null,
    gpuAcceleration: "off",
    open,
    terminalOptions: {
      fontFamily: "monospace",
      fontSize: 13,
      fontWeight: 400,
      lineHeight: 1.2,
      theme: {
        background,
        foreground,
        red,
      },
    },
    terminalVisible: open,
    workingDirectory: "/workspace",
    onHide: vi.fn(),
  });
  latestManager = manager;

  return manager.tabs.map((tab) => (
    <div key={tab.id} ref={(node) => manager.attachContainer(tab.id, node)} />
  ));
}

const PROMPT = "~/code %";
const SUGGESTED_COMMAND = "git commit -m 'fix ghost text'";

function terminalKeyEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    code: "Tab",
    ctrlKey: false,
    key: "Tab",
    metaKey: false,
    shiftKey: false,
    type: "keydown",
    ...overrides,
  } as KeyboardEvent;
}

async function flushSuggestion() {
  // The controller coalesces refreshes into an animation frame, so the assertions
  // have to run after jsdom has delivered one.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

async function typeRow(row: string) {
  xtermMock.row = row;
  xtermMock.cursorX = row.length;
  await act(async () => {
    for (const handler of xtermMock.handlers.write) handler();
  });
  await flushSuggestion();
}

function getSuggestionElement() {
  return xtermMock.instances[0]?.element?.querySelector(
    ".axon-terminal-suggestion",
  );
}

describe("useTerminalSessionManager", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof ResizeObserver;
  let originalWebSocket: typeof WebSocket;

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    originalWebSocket = globalThis.WebSocket;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: FakeResizeObserver,
    });
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: FakeWebSocket,
    });
    Object.defineProperty(window, "axon", {
      configurable: true,
      value: terminalBridgeMock,
    });
    terminalBridgeMock.createTerminalTicket.mockReset();
    terminalBridgeMock.createTerminalTicket.mockResolvedValue(
      "ws://127.0.0.1:17778/terminal?ticket=test-ticket",
    );
    terminalBridgeMock.getTerminalCommandHistory.mockReset();
    terminalBridgeMock.getTerminalCommandHistory.mockResolvedValue([
      "git commit -m 'fix ghost text'",
    ]);
    terminalBridgeMock.openExternalLink.mockReset();
    terminalBridgeMock.openExternalLink.mockResolvedValue(undefined);
    xtermMock.handlers.key.length = 0;
    xtermMock.handlers.write.length = 0;
    xtermMock.row = "";
    xtermMock.cursorX = 0;
    webLinksAddonMock.handlers.length = 0;
    xtermMock.focus.mockReset();
    xtermMock.instances.length = 0;
    FakeWebSocket.instances.length = 0;
    resetCommandHistoryForTests();
    latestManager = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: originalResizeObserver,
    });
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    });
  });

  it("starts the backend connection when the first terminal mounts", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(terminalBridgeMock.createTerminalTicket).toHaveBeenCalledOnce();
    expect(terminalBridgeMock.createTerminalTicket).toHaveBeenCalledWith(
      "/workspace",
    );
  });

  it("focuses xterm when its terminal panel becomes active", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(xtermMock.focus).toHaveBeenCalled();
  });

  it("asks a running TUI to re-query colors after a live theme change", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    expect(socket.sent).not.toContain("\x1b[I");

    await act(async () => {
      root.render(
        <TerminalHarness background="#ffffff" foreground="#171717" />,
      );
    });

    expect(socket.sent.filter((data) => data === "\x1b[I")).toHaveLength(1);
    expect(xtermMock.instances[0]?.options.theme).toEqual({
      background: "#ffffff",
      foreground: "#171717",
      red: "#cd3131",
    });
  });

  it("updates the complete xterm palette on a live theme change", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      root.render(<TerminalHarness red="#f38ba8" />);
    });

    expect(xtermMock.instances[0]?.options.theme).toEqual({
      background: "#000000",
      foreground: "#ffffff",
      red: "#f38ba8",
    });
  });

  it("does not inject a focus report when the application did not request it", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const terminal = xtermMock.instances[0];
    const socket = FakeWebSocket.instances[0];
    expect(terminal).toBeDefined();
    expect(socket).toBeDefined();
    terminal.modes.sendFocusMode = false;

    await act(async () => {
      root.render(
        <TerminalHarness background="#ffffff" foreground="#171717" />,
      );
    });

    expect(socket.sent).not.toContain("\x1b[I");
  });

  it("lets a link mouseup reach xterm's document selection listener", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const linkHandler = webLinksAddonMock.handlers[0];
    expect(linkHandler).toBeDefined();

    // xterm starts selection on the terminal element, but owns the matching
    // mouseup cleanup listener on the document so dragging can continue beyond
    // the viewport. Reproduce that event boundary to ensure Axon's link opener
    // does not trap the mouseup inside the terminal again.
    const linkTarget = document.createElement("div");
    const onDocumentMouseUp = vi.fn();
    linkTarget.addEventListener("mouseup", (event) => {
      linkHandler(event, "https://example.com/docs");
    });
    document.addEventListener("mouseup", onDocumentMouseUp);
    document.body.appendChild(linkTarget);

    try {
      linkTarget.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );

      expect(onDocumentMouseUp).toHaveBeenCalledOnce();
      expect(terminalBridgeMock.openExternalLink).toHaveBeenCalledWith(
        "https://example.com/docs",
      );
    } finally {
      document.removeEventListener("mouseup", onDocumentMouseUp);
      linkTarget.remove();
    }
  });
  it("accepts the visible suggestion on Tab without letting the shell see it", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await flushSuggestion();

    // The first row the controller sees is treated as the prompt, which is how it
    // learns where the user's own input starts.
    await typeRow(PROMPT);
    await typeRow(`${PROMPT}git`);
    expect(getSuggestionElement()?.textContent).toBe(
      SUGGESTED_COMMAND.slice("git".length),
    );

    const handled =
      xtermMock.instances[0]?.customKeyEventHandler?.(terminalKeyEvent());
    expect(handled).toBe(false);

    const socket = FakeWebSocket.instances[0];
    expect(socket.sent).toContain(SUGGESTED_COMMAND.slice("git".length));
    expect(socket.sent).not.toContain("\t");
    expect(getSuggestionElement()).toBeNull();
  });

  it("leaves Tab to the shell when there is no suggestion to accept", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await flushSuggestion();

    await typeRow(PROMPT);
    await typeRow(`${PROMPT}zsh`);

    expect(getSuggestionElement()).toBeNull();
    expect(
      xtermMock.instances[0]?.customKeyEventHandler?.(terminalKeyEvent()),
    ).toBe(true);
  });

  it("brings suggestions back once the input line changes after Escape", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await flushSuggestion();

    await typeRow(PROMPT);
    await typeRow(`${PROMPT}git`);
    expect(getSuggestionElement()).not.toBeNull();

    await act(async () => {
      for (const handler of xtermMock.handlers.key) handler({ key: "Escape" });
    });
    expect(getSuggestionElement()).toBeNull();

    // The dismissed line must not resurface on the next refresh, and anything
    // typed after it counts as a new line the user wants help with.
    await act(async () => {
      for (const handler of xtermMock.handlers.key) handler({ key: "Escape" });
    });
    expect(getSuggestionElement()).toBeNull();

    await typeRow(`${PROMPT}git c`);
    expect(getSuggestionElement()?.textContent).toBe(
      SUGGESTED_COMMAND.slice("git c".length),
    );
  });

  it("suggests a command that was run in this session", async () => {
    terminalBridgeMock.getTerminalCommandHistory.mockResolvedValue([]);

    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await flushSuggestion();

    await typeRow(PROMPT);
    await typeRow(`${PROMPT}npm run build`);
    await act(async () => {
      for (const handler of xtermMock.handlers.key) handler({ key: "Enter" });
    });

    await typeRow(PROMPT);
    await typeRow(`${PROMPT}npm`);

    expect(getSuggestionElement()?.textContent).toBe(" run build");
  });

  it("keeps suggestions off when the setting is disabled", async () => {
    await act(async () => {
      root.render(<TerminalHarness commandSuggestions={false} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await flushSuggestion();

    await typeRow(PROMPT);
    await typeRow(`${PROMPT}git`);

    expect(getSuggestionElement()).toBeNull();
  });

  it("reorders tabs without rebuilding their sessions", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      latestManager?.createTab();
    });

    const [first, second] = latestManager?.tabs.map((tab) => tab.id) ?? [];
    const activeTabId = latestManager?.activeTabId;
    const termsBefore = [...xtermMock.instances];
    const socketsBefore = FakeWebSocket.instances.length;

    await act(async () => {
      latestManager?.reorderTabs([second, first]);
    });

    expect(latestManager?.tabs.map((tab) => tab.id)).toEqual([second, first]);
    // Reordering is presentation only, so the active tab, the xterm instances,
    // and the PTY websockets all have to survive the drag untouched.
    expect(latestManager?.activeTabId).toBe(activeTabId);
    expect(xtermMock.instances).toEqual(termsBefore);
    expect(FakeWebSocket.instances.length).toBe(socketsBefore);
  });

  it("ignores a reorder request that would drop a tab", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      latestManager?.createTab();
    });

    const orderBefore = latestManager?.tabs.map((tab) => tab.id);
    await act(async () => {
      latestManager?.reorderTabs([]);
    });

    expect(latestManager?.tabs.map((tab) => tab.id)).toEqual(orderBefore);
  });

  it("clears the zoom flag when the panel is hidden", async () => {
    await act(async () => {
      root.render(<TerminalHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      latestManager?.setZoomed(true);
    });
    expect(latestManager?.zoomed).toBe(true);

    // The toggle command and zen mode both hide the panel through `open`, so a
    // zoomed panel must come back unzoomed instead of stranding its controls in
    // the window's top strip.
    await act(async () => {
      root.render(<TerminalHarness open={false} />);
    });

    expect(latestManager?.zoomed).toBe(false);
  });
});
