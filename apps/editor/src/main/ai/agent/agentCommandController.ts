/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { type AiCommandPermissionMode } from "../../../shared/core/settings";
import { commandSessionAllowlist } from "../../security/commandSessionAllowlist";
import {
  resolveWorkspaceCommandCwd,
  runWorkspaceCommand,
} from "../../security/runWorkspaceCommand";
import { type WorkspaceCapabilityRegistry } from "../../security/workspaceCapabilities";

export interface PreparedAgentCommand {
  command: string;
  cwd: string;
}

export interface AgentCommandResult {
  ok: boolean;
  message: string;
  result: string;
}

export interface AgentCommandController {
  mode: AiCommandPermissionMode;
  prepare(input: { command: string; cwd?: string }): Promise<PreparedAgentCommand>;
  isAllowed(command: PreparedAgentCommand): boolean;
  allow(command: PreparedAgentCommand): void;
  run(
    command: PreparedAgentCommand,
    signal: AbortSignal,
  ): Promise<AgentCommandResult>;
}

// The controller is bound to one renderer and one workspace before the agent
// loop starts. That binding is what keeps an approval or an allowlist entry from
// leaking into another window or another project that the same user has open.
export function createAgentCommandController(input: {
  registry: WorkspaceCapabilityRegistry;
  rendererId: number;
  workspaceRoot: string;
  mode: AiCommandPermissionMode;
}): AgentCommandController {
  const workspaceRoot = input.registry.assertRoot(
    input.rendererId,
    input.workspaceRoot,
  );

  return {
    mode: input.mode,
    async prepare({ command, cwd }) {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) throw new Error("No command was provided.");

      const resolvedCwd = resolveWorkspaceCommandCwd(workspaceRoot, cwd);
      input.registry.assertPath(input.rendererId, resolvedCwd);
      const info = await fs.promises.stat(resolvedCwd).catch(() => null);
      if (!info?.isDirectory()) {
        throw new Error(
          "Command working directory does not exist or is not a folder.",
        );
      }
      return { command: trimmedCommand, cwd: resolvedCwd };
    },
    isAllowed(command) {
      return commandSessionAllowlist.isAllowed(
        input.rendererId,
        workspaceRoot,
        command.cwd,
        command.command,
      );
    },
    allow(command) {
      commandSessionAllowlist.allow(
        input.rendererId,
        workspaceRoot,
        command.cwd,
        command.command,
      );
    },
    async run(command, signal) {
      const result = await runWorkspaceCommand({
        workspaceRoot,
        cwd: command.cwd,
        command: command.command,
        signal,
      });
      return {
        ok: result.ok,
        message: result.message,
        result: result.result,
      };
    },
  };
}
