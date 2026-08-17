import type { Terminal } from "@xterm/xterm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalRendererController } from "../../../../../extensions/builtin/terminal/workbench/lib/terminalRenderer";

interface MockWebglAddon {
  clearTextureAtlas: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  emitContextLoss: () => void;
}

const webglAddons = vi.hoisted(() => [] as MockWebglAddon[]);

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class implements MockWebglAddon {
    private contextLossListener: (() => void) | null = null;
    clearTextureAtlas = vi.fn();
    dispose = vi.fn();

    constructor() {
      webglAddons.push(this);
    }

    onContextLoss(listener: () => void) {
      this.contextLossListener = listener;
      return {
        dispose: () => {
          this.contextLossListener = null;
        },
      };
    }

    emitContextLoss() {
      this.contextLossListener?.();
    }
  },
}));

function createTerminal() {
  const terminal = {
    loadAddon: vi.fn(),
    refresh: vi.fn(),
    rows: 24,
  };
  return {
    terminal,
    controller: createTerminalRendererController(
      terminal as unknown as Terminal,
    ),
  };
}

describe("terminal renderer controller", () => {
  beforeEach(() => {
    webglAddons.length = 0;
    vi.restoreAllMocks();
  });

  it("keeps WebGL limited to a visible terminal", () => {
    const { terminal, controller } = createTerminal();

    controller.sync(false, "on");
    controller.sync(true, "off");
    expect(terminal.loadAddon).not.toHaveBeenCalled();

    controller.sync(true, "on");
    expect(terminal.loadAddon).toHaveBeenCalledOnce();
    expect(webglAddons).toHaveLength(1);

    controller.sync(false, "on");
    expect(webglAddons[0].dispose).toHaveBeenCalledOnce();

    controller.sync(true, "on");
    expect(terminal.loadAddon).toHaveBeenCalledTimes(2);
    expect(webglAddons).toHaveLength(2);

    controller.dispose();
    expect(webglAddons[1].dispose).toHaveBeenCalledOnce();
  });

  it("falls back once after context loss and does not retry the session", () => {
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(16);
        return 1;
      });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { terminal, controller } = createTerminal();

    controller.sync(true, "on");
    webglAddons[0].emitContextLoss();

    expect(webglAddons[0].dispose).toHaveBeenCalledOnce();
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
    controller.sync(true, "on");
    expect(terminal.loadAddon).toHaveBeenCalledOnce();

    frame.mockRestore();
  });

  it("clears the WebGL cell cache when forcing a complete redraw", () => {
    const { terminal, controller } = createTerminal();

    controller.sync(true, "on");
    controller.forceFullRedraw();

    expect(webglAddons[0].clearTextureAtlas).toHaveBeenCalledOnce();
    expect(terminal.refresh).not.toHaveBeenCalled();
  });

  it("refreshes visible rows directly when WebGL is disabled", () => {
    const { terminal, controller } = createTerminal();

    controller.sync(true, "off");
    controller.forceFullRedraw();

    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
  });

  it("does not retry a renderer that failed during initialization", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { terminal, controller } = createTerminal();
    terminal.loadAddon.mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });

    controller.sync(true, "on");
    controller.sync(true, "on");

    expect(terminal.loadAddon).toHaveBeenCalledOnce();
    expect(webglAddons).toHaveLength(1);
    expect(webglAddons[0].dispose).toHaveBeenCalledOnce();
  });
});
