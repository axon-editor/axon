import path from "node:path";
import { describe, expect, it } from "vitest";
import { findCliOpenFolderArgument } from "./cliOpenFolder";

describe("CLI open-folder argument parsing", () => {
  it("reads the explicit folder flag", () => {
    const folder = path.resolve("/workspace/axon");
    expect(
      findCliOpenFolderArgument(["Axon", "--axon-open-folder", folder]),
    ).toBe(folder);
  });

  it("reads the inline folder flag", () => {
    const folder = path.resolve("/workspace/axon docs");
    expect(
      findCliOpenFolderArgument(["Axon", `--axon-open-folder=${folder}`]),
    ).toBe(folder);
  });

  it("supports a legacy absolute positional folder", () => {
    const folder = path.resolve("/workspace/legacy");
    expect(findCliOpenFolderArgument(["Axon", folder])).toBe(folder);
  });

  it("does not treat Electron switches as folders", () => {
    expect(
      findCliOpenFolderArgument(["Axon", "--inspect=9229", "axon://callback"]),
    ).toBeNull();
  });
});
