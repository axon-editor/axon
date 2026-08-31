import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronApp = vi.hoisted(() => ({
  isPackaged: true,
  getAppPath: vi.fn<() => string>(),
}));
const existsSync = vi.hoisted(() => vi.fn<(filePath: string) => boolean>());

vi.mock("electron", () => ({ app: electronApp }));
vi.mock("fs", () => ({ default: { existsSync } }));

import { getBundledAppFilePath } from "./paths";

describe("bundled application paths", () => {
  beforeEach(() => {
    electronApp.isPackaged = true;
    electronApp.getAppPath.mockReturnValue(
      path.join(path.sep, "resources", "app.asar"),
    );
    existsSync.mockReset();
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: path.join(path.sep, "resources"),
    });
  });

  it("uses JavaScript language-server entry points inside app.asar", () => {
    existsSync.mockReturnValue(false);

    expect(
      getBundledAppFilePath(
        "node_modules",
        "pyright",
        "langserver.index.js",
      ),
    ).toBe(
      path.join(
        path.sep,
        "resources",
        "app.asar",
        "node_modules",
        "pyright",
        "langserver.index.js",
      ),
    );
  });

  it("prefers an unpacked file when the package contains a native binding", () => {
    const unpackedPath = path.join(
      path.sep,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "tailwind",
      "watcher.node",
    );
    existsSync.mockImplementation((candidate) => candidate === unpackedPath);

    expect(
      getBundledAppFilePath(
        "node_modules",
        "tailwind",
        "watcher.node",
      ),
    ).toBe(unpackedPath);
  });
});
