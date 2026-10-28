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

// UI-only actions still run here because the renderer owns that state. File
// writes return approval only; the main process persists them after the click,
// so the tool loop never treats a renderer-local write as the source of truth.
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

  if (spec.name === "create_directory") {
    const rawPath = typeof args.path === "string" ? args.path.trim() : "";
    if (!rawPath) {
      return { ok: false, message: "No folder path was provided." };
    }
    // Folder creation follows the write_file approval shape: the renderer only
    // reports the user's decision, and the main process performs the mkdir.
    return { ok: true, message: resolvePath(rawPath, deps.folderPath) };
  }

  if (spec.name === "write_file") {
    const rawPath = typeof args.path === "string" ? args.path.trim() : "";
    const content = args.content;
    if (!rawPath) {
      return { ok: false, message: "No file path was provided." };
    }
    if (typeof content !== "string") {
      return { ok: false, message: "No file content was provided." };
    }
    // Approval is the renderer's job; the main process performs the actual
    // write after the renderer reports the decision, so the tool loop never
    // depends on renderer filesystem access. Returning the resolved path keeps
    // the card and the next model turn pointed at the same file the main
    // process is about to replace.
    return { ok: true, message: resolvePath(rawPath, deps.folderPath) };
  }

  if (spec.name === "run_command") {
    const command = typeof args.command === "string" ? args.command.trim() : "";
    if (!command) {
      return { ok: false, message: "No command was provided." };
    }
    const description =
      typeof args.description === "string" ? args.description.trim() : "";
    if (!description) {
      return {
        ok: false,
        message: "No command description was provided.",
      };
    }
    // The renderer never executes shell commands. Approving here only reports
    // the decision; the main process validates the workspace and runs the
    // command after this result arrives.
    return { ok: true, message: command };
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
