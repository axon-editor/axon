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
  closeFile: (path: string) => boolean;
  runCommand: (command: AxonCommand) => void;
  writeFile: (path: string, content: string) => Promise<void>;
}

// Absolute filesystem paths and URI-style tab paths (for example
// axon://workbench/problems) must not be resolved against the workspace root.
function isAbsolutePath(path: string) {
  return /^([a-zA-Z]:[\\/]|\/|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/.test(path);
}

function resolvePath(path: string, folderPath: string | null) {
  if (isAbsolutePath(path) || !folderPath) return path;
  return `${folderPath.replace(/[\\/]$/, "")}/${path}`;
}

// The renderer is the only place that can actually change UI state, so the
// approved action is executed here against the same command runner the command
// palette uses. The result string is sent back to the agent loop as the tool
// result so the model can describe what happened.
export async function runAgentUiTool(
  deps: AgentUiToolDeps,
  name: string,
  args: Record<string, unknown>,
): Promise<AgentToolRunResult> {
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

  if (spec.name === "write_file") {
    const rawPath = typeof args.path === "string" ? args.path.trim() : "";
    const content = typeof args.content === "string" ? args.content : "";
    if (!rawPath) {
      return { ok: false, message: "No file path was provided." };
    }
    const resolvedPath = resolvePath(rawPath, deps.folderPath);
    try {
      await deps.writeFile(resolvedPath, content);
      return { ok: true, message: resolvedPath };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : `Could not write ${resolvedPath}.`,
      };
    }
  }

  if (spec.name === "close_file") {
    const rawPath = typeof args.path === "string" ? args.path.trim() : "";
    if (!rawPath) {
      return { ok: false, message: "No tab path was provided." };
    }
    const resolvedPath = resolvePath(rawPath, deps.folderPath);
    if (!deps.closeFile(resolvedPath)) {
      return { ok: false, message: `No open tab matches ${resolvedPath}.` };
    }
    return { ok: true, message: resolvedPath };
  }

  return { ok: false, message: `Action ${name} is not runnable yet.` };
}
