/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EditorDiagnostic } from "../editor/language/diagnostics";
import { type AiToolDefinition } from "./ai";

// Editor tools read state that only the running editor owns (the Problems
// snapshot today), so they run in the main process against the data the
// renderer already attached to the request. They are separate from project
// tools, which read files through axon-core, and from UI tools, which drive the
// workbench.
export interface AiEditorToolSpec {
  name: string;
  title: string;
  description: string;
  parameters?: Record<
    string,
    { type: "string"; description: string; enum?: string[] }
  >;
  required?: string[];
}

const maxListedProblems = 200;

export const AI_EDITOR_TOOL_SPECS: AiEditorToolSpec[] = [
  {
    name: "list_problems",
    title: "List problems",
    description:
      "List every diagnostic currently reported in the Problems panel across the whole workspace, not just the active file. Use this before fixing or explaining problems so you see all available issues, then read the relevant files. Optionally filter by severity or by a file path fragment.",
    parameters: {
      severity: {
        type: "string",
        description: "Only include diagnostics with this severity.",
        enum: ["error", "warning", "info", "hint"],
      },
      path: {
        type: "string",
        description:
          "Only include diagnostics whose file path contains this text.",
      },
    },
    required: [],
  },
];

export function aiEditorToolSpec(name: string): AiEditorToolSpec | undefined {
  return AI_EDITOR_TOOL_SPECS.find((spec) => spec.name === name);
}

export function aiEditorToolDefinition(spec: AiEditorToolSpec): AiToolDefinition {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec.parameters ?? {})) {
    properties[key] = value;
  }
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: "object",
        properties,
        required: spec.required ?? [],
      },
    },
  };
}

export function aiEditorToolDefinitions(): AiToolDefinition[] {
  return AI_EDITOR_TOOL_SPECS.map(aiEditorToolDefinition);
}

export function runEditorTool(
  name: string,
  args: Record<string, unknown>,
  diagnostics: EditorDiagnostic[],
): string {
  switch (name) {
    case "list_problems":
      return runListProblems(args, diagnostics);
    default:
      return `Unknown editor tool: ${name}`;
  }
}

function stringArgument(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function runListProblems(
  args: Record<string, unknown>,
  diagnostics: EditorDiagnostic[],
) {
  const severityFilter = stringArgument(args, "severity").toLowerCase();
  const pathFilter = stringArgument(args, "path").toLowerCase();
  const filtered = diagnostics.filter((diagnostic) => {
    if (severityFilter && diagnostic.severity !== severityFilter) return false;
    if (pathFilter && !diagnostic.path.toLowerCase().includes(pathFilter)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return diagnostics.length === 0
      ? "list_problems found no problems in the workspace."
      : `list_problems found no problems matching that filter (${diagnostics.length} total).`;
  }

  const counts = { error: 0, warning: 0, info: 0, hint: 0 };
  const lines = filtered.map((diagnostic) => {
    counts[diagnostic.severity] += 1;
    return `${diagnostic.path}:${diagnostic.line}:${diagnostic.column} [${diagnostic.severity}] ${diagnostic.message}`;
  });

  const summary = `list_problems results (${filtered.length} of ${diagnostics.length} problems: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info, ${counts.hint} hints):`;
  const listed = lines.slice(0, maxListedProblems);
  if (lines.length > listed.length) {
    listed.push(
      `... ${lines.length - listed.length} more problems not shown. Filter by severity or path to narrow the list.`,
    );
  }
  return [summary, ...listed].join("\n");
}
