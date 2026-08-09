import { describe, expect, it } from "vitest";
import { LANGUAGE_SERVER_DEFINITIONS } from "./definitions";

describe("language server definitions", () => {
  it("treats standalone Java files as Java workspaces", () => {
    const java = LANGUAGE_SERVER_DEFINITIONS.find(
      (definition) => definition.id === "java",
    );

    expect(java?.workspaceMarkers).toContain("*.java");
  });
});
