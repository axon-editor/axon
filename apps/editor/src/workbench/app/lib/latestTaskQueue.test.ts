import { describe, expect, it, vi } from "vitest";

import { createLatestTaskQueue } from "./latestTaskQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("latest task queue", () => {
  it("runs one trailing request when changes arrive during active work", async () => {
    const firstTask = deferred();
    const inputs: number[] = [];
    const task = vi.fn(async (input: number) => {
      inputs.push(input);
      if (input === 1) await firstTask.promise;
    });
    const queue = createLatestTaskQueue(task);

    const firstRun = queue.run(1);
    const secondRun = queue.run(2);
    const latestRun = queue.run(3);
    expect(inputs).toEqual([1]);

    firstTask.resolve();
    await Promise.all([firstRun, secondRun, latestRun]);

    expect(inputs).toEqual([1, 3]);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh drain after the previous queue becomes idle", async () => {
    const inputs: string[] = [];
    const queue = createLatestTaskQueue(async (input: string) => {
      inputs.push(input);
    });

    await queue.run("first");
    await queue.run("second");

    expect(inputs).toEqual(["first", "second"]);
  });
});
