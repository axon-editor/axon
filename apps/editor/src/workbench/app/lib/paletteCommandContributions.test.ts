import { describe, expect, it } from "vitest";
import { shouldIncludeContributedCommand } from "./paletteCommandContributions";

describe("contributed palette commands", () => {
  it("excludes built-in aliases and keeps independent extension commands", () => {
    expect(shouldIncludeContributedCommand("axon.codeSnapshot.open")).toBe(
      false,
    );
    expect(shouldIncludeContributedCommand("example.tools.run")).toBe(true);
  });
});
