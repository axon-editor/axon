/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";

// Workspace tools arrive with their raw name because the main process only
// knows the tool contract, not how it should read in the transcript. Mapping
// the names here keeps both the Axon loop and the OpenCode loop consistent
// without teaching the main process about UI copy.
const TOOL_TITLES: Record<string, string> = {
  read: "Read file",
  read_file: "Read file",
  list: "List files",
  list_files: "List files",
  glob: "Find files",
  grep: "Search project",
  bash: "Run command",
  shell: "Run command",
  run_command: "Run command",
  edit: "Edit file",
  write: "Write file",
  write_file: "Write file",
  patch: "Apply patch",
  webfetch: "Fetch URL",
  task: "Run subagent",
  create_directory: "Create folder",
};

export function toolTitle(tool: AgentToolCallState) {
  return TOOL_TITLES[tool.name] ?? tool.title;
}
