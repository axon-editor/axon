import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { type TaskOutputEvent } from "../../shared/tasks";
import { TaskManager } from "./tasks";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("task output ownership", () => {
  it("routes each task's output only to the renderer that started it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "axon-tasks-"));
    temporaryRoots.push(root);
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: { hold: 'node -e "setInterval(() => {}, 1000)"' },
      }),
      "utf8",
    );
    const manager = new TaskManager({
      getSpawnEnvironment: async () => process.env,
      sendToRenderer: () => undefined,
    });
    const firstEvents: TaskOutputEvent[] = [];
    const secondEvents: TaskOutputEvent[] = [];

    await manager.startWorkspaceTask(
      root,
      "npm:hold",
      (channel, payload) => {
        if (channel === "task:output") {
          firstEvents.push(payload as TaskOutputEvent);
        }
      },
      1,
    );
    await manager.startWorkspaceTask(
      root,
      "npm:hold",
      (channel, payload) => {
        if (channel === "task:output") {
          secondEvents.push(payload as TaskOutputEvent);
        }
      },
      2,
    );

    expect(firstEvents).toHaveLength(1);
    expect(secondEvents).toHaveLength(1);
    expect(firstEvents[0].runId).not.toBe(secondEvents[0].runId);
    manager.stopAll(1);
    manager.stopAll(2);
  });
});
