import type { Terminal } from "@xterm/xterm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalRendererController } from "../../../../../extensions/builtin/terminal/workbench/lib/terminalRenderer";

interface MockWebglAddon {
  constructorArguments: unknown[];
  dispose: ReturnType<typeof vi.fn>;
  emitContextLoss: () => void;
}

const webglAddons = vi.hoisted(() => [] as MockWebglAddon[]);

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class implements MockWebglAddon {
    private contextLossListener: (() => void) | null = null;
    constructorArguments: unknown[];
    dispose = vi.fn();

    constructor(...constructorArguments: unknown[]) {
      this.constructorArguments = constructorArguments;
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
  const requestRefreshDimensions = vi.fn();
  const terminal = {
    loadAddon: vi.fn(),
    rows: 24,
  };
  return {
    terminal,
    requestRefreshDimensions,
    controller: createTerminalRendererController(
      terminal as unknown as Terminal,
      requestRefreshDimensions,
    ),
  };
}

describe("terminal renderer controller", () => {
  beforeEach(() => {
    webglAddons.length = 0;
    vi.restoreAllMocks();
  });

  it("keeps WebGL limited to a visible terminal", () => {
    const { terminal, controller, requestRefreshDimensions } = createTerminal();

    controller.sync(false, "on");
    controller.sync(true, "off");
    expect(terminal.loadAddon).not.toHaveBeenCalled();

    controller.sync(true, "on");
    expect(terminal.loadAddon).toHaveBeenCalledOnce();
    expect(webglAddons).toHaveLength(1);
    expect(webglAddons[0].constructorArguments).toEqual([]);
    expect(requestRefreshDimensions).toHaveBeenCalledOnce();

    controller.sync(false, "on");
    expect(webglAddons[0].dispose).toHaveBeenCalledOnce();
    expect(requestRefreshDimensions).toHaveBeenCalledTimes(2);

    controller.sync(true, "on");
    expect(terminal.loadAddon).toHaveBeenCalledTimes(2);
    expect(webglAddons).toHaveLength(2);
    expect(requestRefreshDimensions).toHaveBeenCalledTimes(3);

    controller.dispose();
    expect(webglAddons[1].dispose).toHaveBeenCalledOnce();
  });

  it("falls back once after context loss and does not retry the session", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { terminal, controller, requestRefreshDimensions } = createTerminal();

    controller.sync(true, "on");
    requestRefreshDimensions.mockClear();
    webglAddons[0].emitContextLoss();

    expect(webglAddons[0].dispose).toHaveBeenCalledOnce();
    expect(requestRefreshDimensions).toHaveBeenCalledOnce();
    controller.sync(true, "on");
    expect(terminal.loadAddon).toHaveBeenCalledOnce();
  });

  it("does not retry a renderer that failed during initialization", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { terminal, controller, requestRefreshDimensions } = createTerminal();
    terminal.loadAddon.mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });

    controller.sync(true, "on");
    controller.sync(true, "on");

    expect(terminal.loadAddon).toHaveBeenCalledOnce();
    expect(webglAddons).toHaveLength(1);
    expect(webglAddons[0].dispose).toHaveBeenCalledOnce();
    expect(requestRefreshDimensions).toHaveBeenCalledOnce();
  });
});
