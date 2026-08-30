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
import { useTerminalSessionManager } from "../../../../../extensions/builtin/terminal/workbench/lib/useTerminalSessionManager";

const terminalBridgeMock = vi.hoisted(() => ({
  createTerminalTicket: vi.fn(),
  openExternalLink: vi.fn(),
}));

const webLinksAddonMock = vi.hoisted(() => ({
  handlers: [] as Array<(event: MouseEvent, uri: string) => void>,
}));

const xtermMock = vi.hoisted(() => ({
  focus: vi.fn(),
  instances: [] as Array<{
    modes: { sendFocusMode: boolean };
    options: Record<string, unknown>;
  }>,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    buffer = {
      active: { type: "normal", viewportY: 0, baseY: 0 },
    };
    cols = 80;
    rows = 24;
    modes = { sendFocusMode: true };
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = { ...options };
      xtermMock.instances.push(this);
    }

    attachCustomKeyEventHandler() {}
    clear() {}
    dispose() {}
    focus() {
      xtermMock.focus();
    }
    loadAddon() {}
    open() {}
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
  foreground?: string;
  red?: string;
}

function TerminalHarness({
  background = "#000000",
  foreground = "#ffffff",
  red = "#cd3131",
}: TerminalHarnessProps) {
  const manager = useTerminalSessionManager({
    activePanelTab: "terminal",
    createNonce: 0,
    createWorkingDirectory: null,
    gpuAcceleration: "off",
    open: true,
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
    terminalVisible: true,
    workingDirectory: "/workspace",
    onHide: vi.fn(),
  });

  return manager.tabs.map((tab) => (
    <div key={tab.id} ref={(node) => manager.attachContainer(tab.id, node)} />
  ));
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
    terminalBridgeMock.openExternalLink.mockReset();
    terminalBridgeMock.openExternalLink.mockResolvedValue(undefined);
    webLinksAddonMock.handlers.length = 0;
    xtermMock.focus.mockReset();
    xtermMock.instances.length = 0;
    FakeWebSocket.instances.length = 0;
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
});
