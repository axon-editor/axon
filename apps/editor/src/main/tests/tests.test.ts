import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { TestFinishedEvent } from "../../shared/tests";
import { TestManager } from "./tests";

const temporaryRoots = new Set<string>();

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

afterEach(async () => {
  await Promise.all(
    Array.from(temporaryRoots, (root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
  temporaryRoots.clear();
});

describe("test process cancellation", () => {
  it("cancels a queued run before its process starts", async () => {
    const root = await createTestWorkspace();
    const manager = new TestManager({ sendToRenderer: () => {} });
    const provider = manager.discover(root).providers[0];

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
      sendToRenderer: (channel, payload) => {
        if (channel === "tests:finished") {
          finishRun?.(payload as TestFinishedEvent);
        }
      },
    });
    const provider = manager.discover(root).providers[0];
    const result = await manager.run(root, provider.id);

    expect(result.ok).toBe(true);
    expect(manager.stopAll().stopped).toBe(1);
    await expect(finished).resolves.toMatchObject({
      runId: result.runId,
      status: "stopped",
    });
  }, 15_000);
});
