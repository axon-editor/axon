import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  writeMetalsLauncher,
  writePowerShellEditorServicesLauncher,
} from "./powershellLauncher";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function temporaryLauncherPath(name: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "axon-launcher-test-"));
  roots.push(root);
  return path.join(root, "bin", name);
}

describe("managed runtime launchers", () => {
  it("launches PowerShell Editor Services over stdio with managed paths", async () => {
    const launcherPath = await temporaryLauncherPath(
      process.platform === "win32" ? "PowerShellEditorServices.cmd" : "PowerShellEditorServices",
    );
    await writePowerShellEditorServicesLauncher({
      launcherPath,
      scriptPath: path.join("tool", "runtime", "extension", "modules", "PowerShellEditorServices", "Start-EditorServices.ps1"),
      runtimePath: path.join("runtime", process.platform === "win32" ? "pwsh.cmd" : "pwsh"),
      toolRoot: path.join("tool", "powershell"),
      version: "2025.4.0",
    });
    const launcher = await fs.readFile(launcherPath, "utf8");
    expect(launcher).toContain("Start-EditorServices.ps1");
    expect(launcher).toContain("-Stdio");
    expect(launcher).toContain("pwsh");
    expect(launcher).toContain("editor-services.log");
  });

  it("keeps the bootstrapped Metals cache inside its managed tool root", async () => {
    const launcherPath = await temporaryLauncherPath(
      process.platform === "win32" ? "metals.cmd" : "metals",
    );
    await writeMetalsLauncher({
      launcherPath,
      metalsPath: path.join("tool", "runtime", process.platform === "win32" ? "metals.bat" : "metals"),
      cacheRoot: path.join("tool", "cache"),
    });
    const launcher = await fs.readFile(launcherPath, "utf8");
    expect(launcher).toContain("COURSIER_CACHE");
    expect(launcher).toContain(path.join("tool", "cache"));
    expect(launcher).toContain(path.join("tool", "runtime", "metals"));
  });
});
