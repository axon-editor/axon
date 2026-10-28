/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { CommandSessionAllowlist } from "./commandSessionAllowlist";

describe("CommandSessionAllowlist", () => {
  it("allows the exact command and working directory after approval", () => {
    const allowlist = new CommandSessionAllowlist();

    allowlist.allow(7, "/workspace", "/workspace", "npm test");

    expect(allowlist.isAllowed(7, "/workspace", "/workspace", "npm test")).toBe(
      true,
    );
  });

  it("does not allow a different command or working directory", () => {
    const allowlist = new CommandSessionAllowlist();
    allowlist.allow(7, "/workspace", "/workspace", "npm test");

    expect(
      allowlist.isAllowed(7, "/workspace", "/workspace", "npm test -- --watch"),
    ).toBe(false);
    expect(allowlist.isAllowed(7, "/workspace", "/workspace/apps", "npm test")).toBe(
      false,
    );
  });

  it("scopes approvals to one renderer and workspace", () => {
    const allowlist = new CommandSessionAllowlist();
    allowlist.allow(7, "/workspace", "/workspace", "npm test");

    expect(allowlist.isAllowed(8, "/workspace", "/workspace", "npm test")).toBe(
      false,
    );
    expect(allowlist.isAllowed(7, "/other", "/other", "npm test")).toBe(false);
  });

  it("drops every approval for a renderer when its window closes", () => {
    const allowlist = new CommandSessionAllowlist();
    allowlist.allow(7, "/workspace", "/workspace", "npm test");
    allowlist.allow(7, "/other", "/other", "npm build");
    allowlist.allow(8, "/workspace", "/workspace", "npm test");

    allowlist.releaseRenderer(7);

    expect(allowlist.isAllowed(7, "/workspace", "/workspace", "npm test")).toBe(
      false,
    );
    expect(allowlist.isAllowed(7, "/other", "/other", "npm build")).toBe(false);
    expect(allowlist.isAllowed(8, "/workspace", "/workspace", "npm test")).toBe(
      true,
    );
  });
});
