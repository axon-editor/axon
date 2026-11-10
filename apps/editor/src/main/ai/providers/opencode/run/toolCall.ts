/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiToolCall } from "../../../../../shared/ai/ai";
import { type OpenCodePermissionRequest } from "../client/types";

const TOOL_TITLES: Record<string, string> = {
  shell: "Run command",
  bash: "Run command",
  read: "Read file",
  write: "Write file",
  edit: "Edit file",
  patch: "Apply patch",
  grep: "Search project",
  glob: "Find files",
  list: "List files",
  webfetch: "Fetch URL",
  websearch: "Search web",
  task: "Run subagent",
};

function humanizeToolName(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function createToolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {},
  permissionOnly = false,
): AiToolCall {
  return {
    id,
    name,
    kind: "workspace",
    title: TOOL_TITLES[name] ?? humanizeToolName(name),
    arguments: args,
    ...(permissionOnly ? { permissionOnly: true } : {}),
  };
}

// Permission resources are provider-shaped strings. Mapping the first resource
// to the argument name Axon's cards already understand keeps the approval card
// readable instead of dumping a generic resources array.
export function permissionArguments(
  permission: OpenCodePermissionRequest,
): Record<string, unknown> {
  const first = permission.resources[0];
  if (permission.action === "shell" && first) return { command: first };
  if (
    (permission.action === "edit" || permission.action === "write") &&
    first
  ) {
    return { path: first };
  }
  if (permission.action === "webfetch" && first) return { url: first };
  if (permission.resources.length > 0) {
    return { resources: permission.resources };
  }
  return {};
}

export function toolResultText(data: Record<string, unknown>) {
  const content = data.content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  return "";
}
