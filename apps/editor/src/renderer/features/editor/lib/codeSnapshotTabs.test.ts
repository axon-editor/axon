import { describe, expect, it } from "vitest";
import {
  createCodeSnapshotTabPath,
  getCodeSnapshotSource,
  isCodeSnapshotTabPath,
} from "@axon-builtin-code-snapshot/lib/codeSnapshotTabs";

describe("code snapshot tab identity", () => {
  it("keeps each snapshot payload attached to a unique virtual tab", () => {
    const source = {
      content: "const answer = 42;",
      endLine: 4,
      filePath: "/workspace/example.ts",
      languageId: "typescript",
      startLine: 4,
    };
    const first = createCodeSnapshotTabPath(source);
    const second = createCodeSnapshotTabPath(source);

    expect(isCodeSnapshotTabPath(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(getCodeSnapshotSource(first)).toEqual(source);
  });
});
