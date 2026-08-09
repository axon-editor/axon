import { describe, expect, it, vi } from "vitest";
import { runWithActivityWatchdog } from "./activityWatchdog";

describe("language tool activity watchdog", () => {
  it("aborts work that stops reporting progress", async () => {
    vi.useFakeTimers();
    try {
      const operation = runWithActivityWatchdog({
        signal: new AbortController().signal,
        idleTimeoutMs: 1000,
        timeoutMessage: "Extraction stopped making progress.",
        operation: (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      });
      const rejection = expect(operation).rejects.toMatchObject({
        name: "TimeoutError",
        message: "Extraction stopped making progress.",
      });

      await vi.advanceTimersByTimeAsync(1001);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the idle timeout when work reports activity", async () => {
    vi.useFakeTimers();
    try {
      const operation = runWithActivityWatchdog({
        signal: new AbortController().signal,
        idleTimeoutMs: 1000,
        timeoutMessage: "Timed out.",
        operation: async (_signal, markActivity) => {
          await vi.advanceTimersByTimeAsync(900);
          markActivity();
          await vi.advanceTimersByTimeAsync(900);
          return "complete";
        },
      });

      await expect(operation).resolves.toBe("complete");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a longer idle timeout only for an unobservable extraction phase", async () => {
    vi.useFakeTimers();
    try {
      const operation = runWithActivityWatchdog({
        signal: new AbortController().signal,
        idleTimeoutMs: 1000,
        timeoutMessage: "Timed out.",
        operation: async (_signal, markActivity) => {
          await vi.advanceTimersByTimeAsync(900);
          markActivity(3000);
          await vi.advanceTimersByTimeAsync(2000);
          return "complete";
        },
      });

      await expect(operation).resolves.toBe("complete");
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates user cancellation without waiting for the timeout", async () => {
    const controller = new AbortController();
    const operation = runWithActivityWatchdog({
      signal: controller.signal,
      idleTimeoutMs: 60_000,
      timeoutMessage: "Timed out.",
      operation: (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    });

    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });
});
