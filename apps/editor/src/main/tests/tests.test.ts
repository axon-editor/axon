/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { TestFinishedEvent } from "../../shared/editor/testing/tests";
import { TestManager } from "./tests";

const temporaryRoots = new Set<string>();

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function createTestWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "axon-tests-"));
  temporaryRoots.add(root);
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: {
        test: 'node -e "setInterval(() => {}, 1000)"',
      },
    }),
  );
  return root;
}

async function createWorkspaceFiles(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "axon-tests-"));
  temporaryRoots.add(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    Array.from(temporaryRoots, (root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
  temporaryRoots.clear();
});

describe("test discovery", () => {
  it("discovers Django tests.py files through manage.py", async () => {
    const root = await createWorkspaceFiles({
      "manage.py": "",
      "requirements.txt": "Django\n",
      "apps/products/tests.py": "class ProductTests: pass\n",
      "apps/accounts/test_views.py": "",
      "apps/accounts/helpers.py": "",
      "core/tests.py": "",
    });
    const manager = new TestManager({
      sendToRenderer: () => undefined,
      resolvePythonEnvironment: async () => ({
        interpreterPath: "/project/venv/bin/python",
        fromVirtualEnv: true,
      }),
    });

    const discovery = await manager.discover(root);
    const provider = discovery.providers.find(
      (entry) => entry.kind === "django",
    );

    expect(provider).toMatchObject({
      kind: "django",
      pythonPath: "/project/venv/bin/python",
    });
    const labels = discovery.items
      .filter((item) => item.providerId === provider?.id)
      .map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "apps/accounts/test_views.py",
        "apps/products/tests.py",
        "core/tests.py",
      ]),
    );
    expect(labels).not.toContain("apps/accounts/helpers.py");
  });

  it("keeps pytest when the project opts into it", async () => {
    const root = await createWorkspaceFiles({
      "manage.py": "",
      "pyproject.toml":
        '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      "tests/tests.py": "",
      "tests/test_views.py": "",
    });
    const manager = new TestManager({
      sendToRenderer: () => undefined,
      resolvePythonEnvironment: async () => ({
        interpreterPath: "/usr/bin/python3",
        fromVirtualEnv: false,
      }),
    });

    const discovery = await manager.discover(root);
    const provider = discovery.providers.find(
      (entry) => entry.kind === "pytest",
    );

    expect(provider).toBeDefined();
    expect(provider?.pythonPath).toBeUndefined();
    const labels = discovery.items
      .filter((item) => item.providerId === provider?.id)
      .map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining(["tests/tests.py", "tests/test_views.py"]),
    );
  });

  it("does not treat an unrelated pyproject as pytest", async () => {
    const root = await createWorkspaceFiles({
      "manage.py": "",
      "pyproject.toml": "[tool.ruff]\nline-length = 88\n",
      "tests.py": "",
    });
    const manager = new TestManager({
      sendToRenderer: () => undefined,
      resolvePythonEnvironment: async () => ({
        interpreterPath: "/usr/bin/python3",
        fromVirtualEnv: false,
      }),
    });

    const discovery = await manager.discover(root);
    expect(discovery.providers.map((entry) => entry.kind)).toContain("django");
    expect(discovery.providers.map((entry) => entry.kind)).not.toContain(
      "pytest",
    );
  });
});

describe("test process cancellation", () => {
  it("cancels a queued run before its process starts", async () => {
    const root = await createTestWorkspace();
    const manager = new TestManager({
      sendToRenderer: () => {},
      getSpawnEnvironment: async () => process.env,
    });
    const provider = (await manager.discover(root)).providers[0];

    const run = manager.run(root, provider.id);
    const stop = manager.stopAll();
    const result = await run;

    expect(stop.stopped).toBe(1);
    expect(result).toMatchObject({ ok: false, runId: null });
    expect(result.message).toContain("stopped before it started");
  });

  it("stops the npm launcher and its active test process", async () => {
    const root = await createTestWorkspace();
    let finishRun: ((event: TestFinishedEvent) => void) | null = null;
    const finished = new Promise<TestFinishedEvent>((resolve) => {
      finishRun = resolve;
    });
    const manager = new TestManager({
      getSpawnEnvironment: async () => process.env,
      sendToRenderer: (channel, payload) => {
        if (channel === "tests:finished") {
          finishRun?.(payload as TestFinishedEvent);
        }
      },
    });
    const provider = (await manager.discover(root)).providers[0];
    const result = await manager.run(root, provider.id);

    expect(result.ok).toBe(true);
    expect(manager.stopAll().stopped).toBe(1);
    await expect(finished).resolves.toMatchObject({
      runId: result.runId,
      status: "stopped",
    });
  }, 15_000);

  it("cancels pending runs only for the requesting renderer", async () => {
    const root = await createTestWorkspace();
    const environmentGate = createDeferred<void>();
    const manager = new TestManager({
      sendToRenderer: () => undefined,
      getSpawnEnvironment: async () => {
        await environmentGate.promise;
        return process.env;
      },
    });
    const provider = (await manager.discover(root)).providers[0];
    const firstRun = manager.run(root, provider.id, null, undefined, 1);
    const secondRun = manager.run(root, provider.id, null, undefined, 2);

    expect(manager.stopAll(1).stopped).toBe(1);
    environmentGate.resolve();
    const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

    expect(firstResult).toMatchObject({ ok: false, runId: null });
    expect(secondResult.ok).toBe(true);
    expect(manager.stopAll(2).stopped).toBe(1);
  });
});
