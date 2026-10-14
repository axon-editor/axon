/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AxonCommand } from "@axon-editor/shared/commands/commands";
import { aiUiToolSpec } from "@axon-editor/shared/ai/uiTools";

export interface AgentToolRunResult {
  ok: boolean;
  message?: string;
}

export interface AgentUiToolDeps {
  folderPath: string | null;
  openFile: (path: string) => void;
  runCommand: (command: AxonCommand) => void;
}

function isAbsolutePath(path: string) {
  return /^([a-zA-Z]:[\\/]|\/)/.test(path);
}

function resolvePath(path: string, folderPath: string | null) {
  if (isAbsolutePath(path) || !folderPath) return path;
  return `${folderPath.replace(/[\\/]$/, "")}/${path}`;
}

// The renderer is the only place that can actually change UI state, so the
// approved action is executed here against the same command runner the command
// palette uses. The result string is sent back to the agent loop as the tool
// result so the model can describe what happened.
export function runAgentUiTool(
  deps: AgentUiToolDeps,
  name: string,
  args: Record<string, unknown>,
): AgentToolRunResult {
  const spec = aiUiToolSpec(name);
  if (!spec) {
    return { ok: false, message: `Unknown action ${name}.` };
  }

  if (spec.command) {
    deps.runCommand(spec.command);
    return { ok: true, message: spec.title };
  }

  if (spec.name === "open_file") {
    const rawPath = typeof args.path === "string" ? args.path.trim() : "";
    if (!rawPath) {
      return { ok: false, message: "No file path was provided." };
    }
    const resolvedPath = resolvePath(rawPath, deps.folderPath);
    deps.openFile(resolvedPath);
    return { ok: true, message: resolvedPath };
  }

  return { ok: false, message: `Action ${name} is not runnable yet.` };
}
