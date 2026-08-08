import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  findPythonVirtualEnvInWorkspace,
  getPythonInterpreterFromVirtualEnv,
  isPythonWorkspace,
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
