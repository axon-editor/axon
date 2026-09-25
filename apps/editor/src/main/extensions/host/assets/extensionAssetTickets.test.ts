/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";

import { ExtensionAssetTicketRegistry } from "./extensionAssetTickets";

function createRegistry(now: () => number) {
  return new ExtensionAssetTicketRegistry(now);
}

function ticketFrom(url: string) {
  return new URL(url).pathname.slice(1);
}

describe("ExtensionAssetTicketRegistry", () => {
  it("exposes an opaque extension URL instead of the package path", () => {
    const registry = createRegistry(() => 1_000);
    const url = registry.issue(7, "/extensions/axon.snake/screenshots/shot-1.png");

    expect(url).toMatch(/^axon:\/\/extension\/[A-Za-z0-9_-]{40,}$/);
    expect(url).not.toContain("axon.snake");
    expect(registry.resolve(ticketFrom(url))).toBe(
      "/extensions/axon.snake/screenshots/shot-1.png",
    );
  });

  it("reuses the live ticket for a repeated request and replaces an expired one", () => {
    let now = 1_000;
    const registry = createRegistry(() => now);
    const first = registry.issue(7, "/extensions/axon.snake/icon.png");

    expect(registry.issue(7, "/extensions/axon.snake/icon.png")).toBe(first);
    // A different renderer must never receive another renderer's token.
    expect(registry.issue(8, "/extensions/axon.snake/icon.png")).not.toBe(first);

    now += 11 * 60 * 1_000;
    expect(registry.resolve(ticketFrom(first))).toBeNull();
    expect(registry.issue(7, "/extensions/axon.snake/icon.png")).not.toBe(first);
  });

  it("revokes every ticket owned by a closed renderer", () => {
    const registry = createRegistry(() => 1_000);
    const closedUrl = registry.issue(8, "/extensions/axon.snake/revoked.png");
    const openUrl = registry.issue(7, "/extensions/axon.snake/open.png");

    registry.releaseRenderer(8);
    expect(registry.resolve(ticketFrom(closedUrl))).toBeNull();
    expect(registry.resolve(ticketFrom(openUrl))).toBe(
      "/extensions/axon.snake/open.png",
    );
  });

  it("drops a ticket once it has expired", () => {
    let now = 1_000;
    const registry = createRegistry(() => now);
    const url = registry.issue(7, "/extensions/axon.snake/expired.png");

    now += 11 * 60 * 1_000;
    expect(registry.resolve(ticketFrom(url))).toBeNull();
    // Resolving an expired token purges it, so a later clock rollback cannot
    // resurrect a file the renderer was only ever briefly granted.
    now = 1_000;
    expect(registry.resolve(ticketFrom(url))).toBeNull();
  });

  it("rejects unknown tokens instead of resolving a path", () => {
    const registry = createRegistry(() => 1_000);
    expect(registry.resolve("not-a-real-ticket")).toBeNull();
    expect(registry.resolve("")).toBeNull();
  });
});

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));
