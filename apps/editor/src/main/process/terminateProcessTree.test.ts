/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from "child_process";
import { once } from "events";
import { describe, expect, it } from "vitest";
import { terminateProcessTree } from "./terminateProcessTree";

describe("terminateProcessTree", () => {
  it("stops a detached child process", async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 10000)"],
      {
        detached: process.platform !== "win32",
        stdio: "ignore",
      },
    );

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      terminateProcessTree(child);
      await once(child, "close");

      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
    }
  });
});
