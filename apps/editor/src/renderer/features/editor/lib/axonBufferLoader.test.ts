import { beforeEach, describe, expect, it, vi } from "vitest";

const { getModel, primeModel, readFile } = vi.hoisted(() => ({
  getModel: vi.fn(),
  primeModel: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../../../shared/lib/api", () => ({ readFile }));
vi.mock("./monacoModels", () => ({ getModel, primeModel }));

import { loadAxonBuffer, prefetchAxonBuffer } from "./axonBufferLoader";

beforeEach(() => {
  readFile.mockReset();
  getModel.mockReset();
  primeModel.mockReset();
});

describe("Axon buffer loader", () => {
  it("shares one renderer request for simultaneous opens of the same path", async () => {
    let resolveLoad: ((value: object) => void) | undefined;
    readFile.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const first = loadAxonBuffer("/workspace/main.ts", "/workspace");
    const second = loadAxonBuffer("/workspace/main.ts", "/workspace");
    resolveLoad?.({
      content: "const value = 1;",
      external: false,
      path: "/workspace/main.ts",
      readOnly: false,
    });

    await expect(first).resolves.toMatchObject({ content: "const value = 1;" });
    await expect(second).resolves.toMatchObject({
      content: "const value = 1;",
    });
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("warms a Monaco buffer with the file security metadata", async () => {
    getModel.mockReturnValue(undefined);
    readFile.mockResolvedValue({
      content: "package main\n",
      external: true,
      path: "/sdk/main.go",
      readOnly: true,
    });

    await prefetchAxonBuffer("/sdk/main.go", "/workspace");

    expect(primeModel).toHaveBeenCalledWith("/sdk/main.go", "package main\n", {
      external: true,
      readOnly: true,
    });
  });

  it("does not read a file that already has a live or retained model", async () => {
    getModel.mockReturnValue({});

    await prefetchAxonBuffer("/workspace/open.ts", "/workspace");

    expect(readFile).not.toHaveBeenCalled();
  });
});
