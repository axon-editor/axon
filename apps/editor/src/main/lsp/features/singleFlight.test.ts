import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";

describe("createSingleFlight", () => {
  it("shares one in-flight operation for the same key", async () => {
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOperation = resolve;
        }),
    );
    const flight = createSingleFlight<string, string>();

    const first = flight.run("json:/workspace", operation);
    const second = flight.run("json:/workspace", operation);

    expect(first).toBe(second);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    resolveOperation?.("ready");
    await expect(first).resolves.toBe("ready");
  });

  it("allows another operation after success or failure", async () => {
    const flight = createSingleFlight<string, number>();

    await expect(flight.run("typescript", () => 1)).resolves.toBe(1);
    await expect(
      flight.run("typescript", () => Promise.reject(new Error("failed"))),
    ).rejects.toThrow("failed");
    await expect(flight.run("typescript", () => 2)).resolves.toBe(2);
  });
});
