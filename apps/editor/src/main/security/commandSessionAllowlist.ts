/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const KEY_SEPARATOR = "\u0000";

// Command approvals are intentionally exact. A broad pattern such as "npm test"
// would also trust "npm test -- --runInBand" in a different directory, and the
// user never saw that command. Binding the key to the canonical working
// directory as well stops the same text from being reused somewhere else in the
// workspace after one approval.
export class CommandSessionAllowlist {
  private readonly commandsBySession = new Map<string, Set<string>>();

  private sessionKey(rendererId: number, workspaceRoot: string) {
    return `${rendererId}${KEY_SEPARATOR}${workspaceRoot}`;
  }

  private commandKey(cwd: string, command: string) {
    return `${cwd}${KEY_SEPARATOR}${command}`;
  }

  isAllowed(
    rendererId: number,
    workspaceRoot: string,
    cwd: string,
    command: string,
  ) {
    return (
      this.commandsBySession
        .get(this.sessionKey(rendererId, workspaceRoot))
        ?.has(this.commandKey(cwd, command)) ?? false
    );
  }

  allow(
    rendererId: number,
    workspaceRoot: string,
    cwd: string,
    command: string,
  ) {
    const sessionKey = this.sessionKey(rendererId, workspaceRoot);
    let commands = this.commandsBySession.get(sessionKey);
    if (!commands) {
      commands = new Set();
      this.commandsBySession.set(sessionKey, commands);
    }
    commands.add(this.commandKey(cwd, command));
  }

  releaseRenderer(rendererId: number) {
    const prefix = `${rendererId}${KEY_SEPARATOR}`;
    for (const key of this.commandsBySession.keys()) {
      if (key.startsWith(prefix)) this.commandsBySession.delete(key);
    }
  }
}

export const commandSessionAllowlist = new CommandSessionAllowlist();
