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

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    buffer = {
      active: { type: "normal", viewportY: 0, baseY: 0 },
    };
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};

    attachCustomKeyEventHandler() {}
    clear() {}
    dispose() {}
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
  WebLinksAddon: class {},
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {},
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  binaryType = "";
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = FakeWebSocket.CONNECTING;

  close() {}
  send() {}
}

class FakeResizeObserver {
  disconnect() {}
  observe() {}
}

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function TerminalHarness() {
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
        background: "#000000",
        foreground: "#ffffff",
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
});
