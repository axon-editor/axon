import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    getVersion: vi.fn(() => "1.3.7"),
    isPackaged: true,
  },
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: console,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
  openExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  app: mocks.app,
  shell: { openExternal: mocks.openExternal },
}));
vi.mock("electron-updater", () => ({ autoUpdater: mocks.autoUpdater }));

import { UpdateManager } from "./updater";

function createManager(overrides: {
  isMac?: boolean;
  isWindows?: boolean;
  execFileAsync?: (file: string, args: string[]) => Promise<unknown>;
} = {}) {
  return new UpdateManager({
    sendToRenderer: vi.fn(),
    releaseApiUrl: "https://api.github.com/repos/axon-editor/axon/releases/latest",
    releasePageUrl: "https://github.com/axon-editor/axon/releases/latest",
    isDev: false,
    isMac: overrides.isMac ?? false,
    isWindows: overrides.isWindows ?? false,
    execFileAsync: overrides.execFileAsync ?? vi.fn().mockResolvedValue({}),
    resolveMacAppBundlePath: () => "/Applications/Axon.app",
    windowsExecutablePath: "C:\\Program Files\\Axon\\Axon.exe",
  });
}

beforeEach(() => {
  mocks.autoUpdater.checkForUpdates.mockReset();
  mocks.autoUpdater.downloadUpdate.mockReset();
});

describe("UpdateManager release trust", () => {
  it("blocks in-app updates for an unsigned Windows executable", async () => {
    const manager = createManager({
      isWindows: true,
      execFileAsync: vi.fn().mockResolvedValue({ stdout: "NotSigned\r\n" }),
    });

    const result = await manager.requestDownload();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not code signed");
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("allows the normal updater path for a valid Windows signature", async () => {
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: { version: "1.3.8" },
    });
    mocks.autoUpdater.downloadUpdate.mockResolvedValue([]);
    const manager = createManager({
      isWindows: true,
      execFileAsync: vi.fn().mockResolvedValue({ stdout: "Valid\r\n" }),
    });

    const result = await manager.requestDownload();

    expect(result.ok).toBe(true);
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce();
  });
});
