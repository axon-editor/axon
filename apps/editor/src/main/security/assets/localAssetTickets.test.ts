import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

import { LocalAssetTicketRegistry } from "./localAssetTickets";

function createRegistry(now: () => number) {
  return new LocalAssetTicketRegistry(
    {
      assertReadablePath: vi.fn(
        (_rendererId: number, filePath: string) => filePath,
      ),
    } as any,
    now,
  );
}

describe("LocalAssetTicketRegistry", () => {
  it("exposes an opaque URL instead of the authorized filesystem path", () => {
    const registry = createRegistry(() => 1_000);
    const url = registry.issue(7, "/workspace/private/image.png");

    expect(url).toMatch(/^axon:\/\/local\/[A-Za-z0-9_-]{40,}$/);
    expect(url).not.toContain("workspace");
    expect(registry.resolve(new URL(url).pathname.slice(1))).toBe(
      "/workspace/private/image.png",
    );
  });

  it("expires tickets and revokes every ticket owned by a closed renderer", () => {
    let now = 1_000;
    const registry = createRegistry(() => now);
    const expiredUrl = registry.issue(7, "/workspace/expired.png");
    const revokedUrl = registry.issue(8, "/workspace/revoked.png");

    now += 11 * 60 * 1_000;
    expect(registry.resolve(new URL(expiredUrl).pathname.slice(1))).toBeNull();

    now = 1_000;
    registry.releaseRenderer(8);
    expect(registry.resolve(new URL(revokedUrl).pathname.slice(1))).toBeNull();
  });
});
