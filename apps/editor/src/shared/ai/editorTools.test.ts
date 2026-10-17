/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  aiEditorToolDefinitions,
  aiEditorToolSpec,
  runEditorTool,
} from "./editorTools";
import { type EditorDiagnostic } from "../editor/language/diagnostics";

function diagnostic(
  overrides: Partial<EditorDiagnostic> & Pick<EditorDiagnostic, "path" | "severity">,
): EditorDiagnostic {
  return {
    id: `${overrides.path}:${overrides.message ?? "x"}`,
    message: "Something is wrong",
    line: 1,
    column: 1,
    source: null,
    ...overrides,
  };
}

describe("aiEditorToolDefinitions", () => {
  it("advertises list_problems with a function-shaped schema", () => {
    const definitions = aiEditorToolDefinitions();
    const listProblems = definitions.find(
      (definition) => definition.function.name === "list_problems",
    );

    expect(listProblems).toBeDefined();
    expect(listProblems?.type).toBe("function");
    expect(listProblems?.function.description).toMatch(/Problems panel/i);
  });
});

describe("runEditorTool list_problems", () => {
  it("reports when the workspace has no problems", () => {
    const result = runEditorTool("list_problems", {}, []);
    expect(result).toBe("list_problems found no problems in the workspace.");
  });

  it("lists diagnostics with a severity and total summary", () => {
    const result = runEditorTool("list_problems", {}, [
      diagnostic({ path: "/w/a.ts", severity: "error", line: 3, column: 5 }),
      diagnostic({ path: "/w/b.ts", severity: "warning" }),
      diagnostic({ path: "/w/b.ts", severity: "warning" }),
    ]);

    expect(result).toContain("3 of 3 problems");
    expect(result).toContain("1 errors, 2 warnings");
    expect(result).toContain("/w/a.ts:3:5 [error]");
  });

  it("filters by severity", () => {
    const result = runEditorTool("list_problems", { severity: "error" }, [
      diagnostic({ path: "/w/a.ts", severity: "error" }),
      diagnostic({ path: "/w/b.ts", severity: "warning" }),
    ]);

    expect(result).toContain("1 of 2 problems");
    expect(result).toContain("/w/a.ts");
    expect(result).not.toContain("/w/b.ts");
  });

  it("filters by path fragment case-insensitively", () => {
    const result = runEditorTool("list_problems", { path: "SRC" }, [
      diagnostic({ path: "/w/src/a.ts", severity: "error" }),
      diagnostic({ path: "/w/test/b.ts", severity: "error" }),
    ]);

    expect(result).toContain("/w/src/a.ts");
    expect(result).not.toContain("/w/test/b.ts");
  });

  it("ignores unknown arguments and reports unknown tools", () => {
    expect(runEditorTool("list_problems", { nope: 1 }, [])).toContain(
      "found no problems",
    );
    expect(runEditorTool("not_a_tool", {}, [])).toBe(
      "Unknown editor tool: not_a_tool",
    );
  });
});

describe("aiEditorToolSpec", () => {
  it("returns the spec for a known tool and undefined otherwise", () => {
    expect(aiEditorToolSpec("list_problems")?.title).toBe("List problems");
    expect(aiEditorToolSpec("missing")).toBeUndefined();
  });
});
