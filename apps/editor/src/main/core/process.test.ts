import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getBundledServiceStdio, terminateChildProcess } from "./process";

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  readonly signals: Array<number | NodeJS.Signals | undefined> = [];
  onKill?: (signal: number | NodeJS.Signals | undefined) => void;

  kill(signal?: number | NodeJS.Signals) {
    this.killed = true;
    this.signals.push(signal);
    this.onKill?.(signal);
    return true;
  }
}

function asChildProcess(child: FakeChildProcess) {
  return child as unknown as ChildProcess;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("terminateChildProcess", () => {
  it("waits for a graceful process exit", async () => {
    const child = new FakeChildProcess();
    child.onKill = () => {
      queueMicrotask(() => {
        child.signalCode = "SIGTERM";
        child.emit("exit", null, "SIGTERM");
      });
    };

    await expect(terminateChildProcess(asChildProcess(child))).resolves.toBe(
      true,
    );
    expect(child.signals).toEqual([undefined]);
  });

  it("force-kills a child that was signalled but never exited", async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess();
    child.killed = true;
    child.onKill = (signal) => {
      if (signal !== "SIGKILL") return;
      child.signalCode = "SIGKILL";
      child.emit("exit", null, "SIGKILL");
    };

    const termination = terminateChildProcess(asChildProcess(child), {
      graceTimeoutMs: 100,
      forceTimeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(termination).resolves.toBe(true);
    expect(child.signals).toEqual(["SIGKILL"]);
  });

  it("reports a process that survives both termination signals", async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess();

    const termination = terminateChildProcess(asChildProcess(child), {
      graceTimeoutMs: 100,
      forceTimeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(200);

    await expect(termination).resolves.toBe(false);
    expect(child.signals).toEqual([
      undefined,
      process.platform === "win32" ? undefined : "SIGKILL",
    ]);
  });
});

describe("getBundledServiceStdio", () => {
  it("keeps an ownership pipe open for the isolated PTY host", () => {
    expect(getBundledServiceStdio(true)).toEqual(["pipe", "pipe", "pipe"]);
  });

  it("leaves stdin detached for services without lifetime monitoring", () => {
    expect(getBundledServiceStdio(false)).toEqual([
      "ignore",
      "pipe",
      "pipe",
    ]);
  });
});
