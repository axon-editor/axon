/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AXON_COMMANDS, type BuiltInAxonCommand } from "../commands/commands";
import { type AiToolDefinition } from "./ai";

// AI UI tools are the exact commands the command palette and menu already run,
// exposed to the model under short names. The spec is shared so the main process
// can describe the tools to the model and the renderer can execute them without
// either side keeping a second, drifting copy of the catalog.
export interface AiUiToolSpec {
  name: string;
  title: string;
  description: string;
  command?: BuiltInAxonCommand;
  parameters?: Record<string, { type: "string"; description: string }>;
  required?: string[];
}

export const AI_UI_TOOL_SPECS: AiUiToolSpec[] = [
  {
    name: "close_active_tab",
    title: "Close active tab",
    description: "Close the tab that is currently active.",
    command: AXON_COMMANDS.CLOSE_TAB,
  },
  {
    name: "toggle_sidebar",
    title: "Toggle sidebar",
    description: "Show or hide the main explorer sidebar.",
    command: AXON_COMMANDS.TOGGLE_SIDEBAR,
  },
  {
    name: "toggle_agent_sidebar",
    title: "Toggle Axon panel",
    description: "Show or hide the Axon Agent chat panel.",
    command: AXON_COMMANDS.TOGGLE_AGENT_SIDEBAR,
  },
  {
    name: "toggle_terminal",
    title: "Toggle terminal",
    description: "Show or hide the integrated terminal panel.",
    command: AXON_COMMANDS.TOGGLE_TERMINAL,
  },
  {
    name: "new_terminal",
    title: "New terminal",
    description: "Open a new integrated terminal.",
    command: AXON_COMMANDS.NEW_TERMINAL,
  },
  {
    name: "toggle_zen_mode",
    title: "Toggle zen mode",
    description: "Enter or leave distraction-free zen mode.",
    command: AXON_COMMANDS.TOGGLE_ZEN_MODE,
  },
  {
    name: "open_settings",
    title: "Open settings",
    description: "Open the settings editor.",
    command: AXON_COMMANDS.OPEN_SETTINGS,
  },
  {
    name: "open_extensions",
    title: "Open extensions",
    description: "Open the extensions manager.",
    command: AXON_COMMANDS.OPEN_EXTENSIONS,
  },
  {
    name: "open_source_control",
    title: "Open source control",
    description: "Open the source control view.",
    command: AXON_COMMANDS.OPEN_SOURCE_CONTROL,
  },
  {
    name: "open_git_history",
    title: "Open Git history",
    description: "Open the Git history view.",
    command: AXON_COMMANDS.OPEN_GIT_HISTORY,
  },
  {
    name: "open_problems",
    title: "Open problems",
    description: "Open the Problems panel with the current diagnostics.",
    command: AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
  },
  {
    name: "open_output",
    title: "Open output",
    description: "Open the Output panel.",
    command: AXON_COMMANDS.OPEN_OUTPUT_PANEL,
  },
  {
    name: "open_file_outline",
    title: "Open file outline",
    description: "Open the outline of the active file.",
    command: AXON_COMMANDS.OPEN_FILE_OUTLINE,
  },
  {
    name: "open_workspace_search",
    title: "Open workspace search",
    description: "Open search across the workspace.",
    command: AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
  },
  {
    name: "open_workspace_overview",
    title: "Open workspace overview",
    description: "Open the workspace overview.",
    command: AXON_COMMANDS.OPEN_WORKSPACE_OVERVIEW,
  },
  {
    name: "open_command_palette",
    title: "Open command palette",
    description: "Open the command palette.",
    command: AXON_COMMANDS.OPEN_COMMAND_PALETTE,
  },
  {
    name: "open_diff_view",
    title: "Open diff view",
    description: "Open the diff of the active file.",
    command: AXON_COMMANDS.OPEN_DIFF_VIEW,
  },
  {
    name: "open_file",
    title: "Open file",
    description: "Open a file in the editor.",
    parameters: {
      path: {
        type: "string",
        description: "Absolute path or path relative to the workspace root.",
      },
    },
    required: ["path"],
  },
  {
    name: "close_file",
    title: "Close tab",
    description:
      "Close an open tab by its path. Accepts a file path or a built-in tab path such as axon://workbench/problems.",
    parameters: {
      path: {
        type: "string",
        description: "Path of the open tab to close.",
      },
    },
    required: ["path"],
  },
];

export function aiUiToolSpec(name: string): AiUiToolSpec | undefined {
  return AI_UI_TOOL_SPECS.find((spec) => spec.name === name);
}

export function aiUiToolDefinition(spec: AiUiToolSpec): AiToolDefinition {
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
