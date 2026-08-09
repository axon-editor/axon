import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  findPythonVirtualEnvInWorkspace,
  findPythonVirtualEnvNearWorkspace,
  getPythonInterpreterFromVirtualEnv,
  isPythonWorkspace,
  parsePythonRuntimeProbe,
  resolvePythonEnvironmentSelection,
} from "./pythonEnvironment";

async function createPythonEnvironment(root: string, name: string) {
  const environmentRoot = path.join(root, name);
  const interpreterPath =
    process.platform === "win32"
      ? path.join(environmentRoot, "Scripts", "python.exe")
      : path.join(environmentRoot, "bin", "python3");
  await fs.mkdir(path.dirname(interpreterPath), { recursive: true });
  await fs.writeFile(
    path.join(environmentRoot, "pyvenv.cfg"),
    "home = /usr/local/bin\n",
  );
  await fs.writeFile(interpreterPath, "python");
  return { environmentRoot, interpreterPath };
}

describe("Python environment discovery", () => {
  it("reads the canonical interpreter and import paths from Python itself", () => {
    expect(
      parsePythonRuntimeProbe(
        [
          "launcher notice",
          JSON.stringify({
            executable: "/workspace/.venv/bin/python",
            prefix: "/workspace/.venv",
            basePrefix: "/usr/local",
            importPaths: ["", "/workspace/src"],
            sitePackages: ["/workspace/.venv/lib/python3.13/site-packages"],
            userSite: "/home/user/.local/lib/python3.13/site-packages",
          }),
        ].join("\n"),
      ),
    ).toEqual({
      executable: "/workspace/.venv/bin/python",
      prefix: "/workspace/.venv",
      basePrefix: "/usr/local",
      importPaths: ["", "/workspace/src"],
      sitePackages: ["/workspace/.venv/lib/python3.13/site-packages"],
      userSite: "/home/user/.local/lib/python3.13/site-packages",
    });
  });

  it("uses Python's package and editable import paths for language analysis", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-runtime-test-"),
    );
    try {
      const environmentRoot = path.join(root, ".venv");
      const interpreterPath = path.join(environmentRoot, "bin", "python");
      const sitePackages = path.join(
        environmentRoot,
        "lib",
        "python3.13",
        "site-packages",
      );
      const editableSource = path.join(root, "packages", "api", "src");
      const basePrefix = path.join(root, "system-python");
      const standardLibrary = path.join(basePrefix, "lib", "python3.13");
      await Promise.all(
        [
          path.dirname(interpreterPath),
          sitePackages,
          editableSource,
          standardLibrary,
        ].map((directory) => fs.mkdir(directory, { recursive: true })),
      );
      await fs.writeFile(interpreterPath, "python");

      const resolved = await resolvePythonEnvironmentSelection(
        { virtualEnvPath: environmentRoot, interpreterPath },
        root,
        {},
        async () =>
          JSON.stringify({
            executable: interpreterPath,
            prefix: environmentRoot,
            basePrefix,
            importPaths: [standardLibrary, sitePackages, editableSource],
            sitePackages: [sitePackages],
            userSite: "",
          }),
      );

      expect(resolved).toEqual({
        virtualEnvPath: environmentRoot,
        interpreterPath,
        importPaths: [sitePackages, editableSource],
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("finds an arbitrarily named environment from pyvenv.cfg", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-env-test-"),
    );
    try {
      const expected = await createPythonEnvironment(
        root,
        "backend-runtime-2026",
      );
      const detected = await findPythonVirtualEnvInWorkspace(root);
      expect(detected).toEqual({
        virtualEnvPath: expected.environmentRoot,
        interpreterPath: expected.interpreterPath,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("finds environments nested inside monorepo packages", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-env-test-"),
    );
    try {
      const expected = await createPythonEnvironment(
        root,
        path.join("packages", "api", ".runtime"),
      );
      const detected = await findPythonVirtualEnvInWorkspace(root);
      expect(detected?.interpreterPath).toBe(expected.interpreterPath);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("finds one arbitrarily named environment beside the workspace", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-adjacent-env-test-"),
    );
    const workspace = path.join(parent, "project");
    try {
      await fs.mkdir(workspace);
      const expected = await createPythonEnvironment(parent, "un_venv");

      await expect(
        findPythonVirtualEnvNearWorkspace(workspace),
      ).resolves.toEqual({
        virtualEnvPath: expected.environmentRoot,
        interpreterPath: expected.interpreterPath,
      });
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });

  it("finds an environment three parent levels above a nested workspace", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-parent-env-test-"),
    );
    const workspace = path.join(root, "packages", "backend", "core");
    try {
      await fs.mkdir(workspace, { recursive: true });
      const expected = await createPythonEnvironment(root, "un_venv");

      await expect(
        findPythonVirtualEnvNearWorkspace(workspace),
      ).resolves.toEqual({
        virtualEnvPath: expected.environmentRoot,
        interpreterPath: expected.interpreterPath,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not guess between multiple environments beside the workspace", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-adjacent-env-test-"),
    );
    const workspace = path.join(parent, "project");
    try {
      await fs.mkdir(workspace);
      await createPythonEnvironment(parent, "frontend_venv");
      await createPythonEnvironment(parent, "backend_venv");

      await expect(
        findPythonVirtualEnvNearWorkspace(workspace),
      ).resolves.toBeNull();
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });

  it("does not treat a directory without pyvenv.cfg as an environment", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-env-test-"),
    );
    try {
      const fakeEnvironment = path.join(root, ".venv");
      const interpreterPath =
        process.platform === "win32"
          ? path.join(fakeEnvironment, "Scripts", "python.exe")
          : path.join(fakeEnvironment, "bin", "python3");
      await fs.mkdir(path.dirname(interpreterPath), { recursive: true });
      await fs.writeFile(interpreterPath, "not-an-environment");

      await expect(findPythonVirtualEnvInWorkspace(root)).resolves.toBeNull();
      expect(getPythonInterpreterFromVirtualEnv(fakeEnvironment)).toBe(
        interpreterPath,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("detects Python projects from nested source files and package markers", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-project-test-"),
    );
    try {
      await fs.mkdir(path.join(root, "packages", "api", "src"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(root, "packages", "api", "src", "main.py"),
        "print('axon')\n",
      );

      expect(isPythonWorkspace(root)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not detect Python from generated dependency content alone", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-python-project-test-"),
    );
    try {
      const dependencyPath = path.join(
        root,
        "node_modules",
        "embedded-tool",
        "main.py",
      );
      await fs.mkdir(path.dirname(dependencyPath), { recursive: true });
      await fs.writeFile(dependencyPath, "print('dependency')\n");

      expect(isPythonWorkspace(root)).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
