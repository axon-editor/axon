/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Axon and OpenCode use different names for the same tool. Grouping the aliases
// here keeps every card helper from growing its own provider-specific list.
export const WRITE_TOOL_NAMES = new Set(["write", "write_file"]);
export const COMMAND_TOOL_NAMES = new Set(["bash", "run_command", "shell"]);
