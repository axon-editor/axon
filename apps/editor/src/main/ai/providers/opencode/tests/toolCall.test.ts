/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  createToolCall,
  permissionArguments,
  toolResultText,
} from "../run/toolCall";

describe("createToolCall", () => {
  it("uses the shared tool title and marks permission-only calls", () => {
    expect(createToolCall("call_1", "shell", { command: "echo hi" }, true)).toEqual(
      {
        id: "call_1",
        name: "shell",
        kind: "workspace",
        title: "Run command",
        arguments: { command: "echo hi" },
        permissionOnly: true,
      },
    );
  });

  it("humanizes unknown tool names", () => {
    expect(createToolCall("call_2", "custom_tool").title).toBe("Custom Tool");
  });
});

describe("permissionArguments", () => {
  it("maps shell resources to the command argument", () => {
    expect(
      permissionArguments({
        id: "per_1",
        sessionID: "ses_1",
        action: "shell",
        resources: ["echo hello"],
      }),
    ).toEqual({ command: "echo hello" });
  });

  it("maps edit resources to a path", () => {
    expect(
      permissionArguments({
        id: "per_2",
        sessionID: "ses_1",
        action: "edit",
        resources: ["src/index.ts"],
      }),
    ).toEqual({ path: "src/index.ts" });
  });
});

describe("toolResultText", () => {
  it("joins text content blocks", () => {
    expect(
      toolResultText({
        content: [{ type: "text", text: "first" }, { text: "second" }],
      }),
    ).toBe("first\nsecond");
  });

  it("falls back to an error message", () => {
    expect(toolResultText({ error: "failed" })).toBe("failed");
  });
});
