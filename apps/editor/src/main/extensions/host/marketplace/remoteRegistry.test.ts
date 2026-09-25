/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getVersion: () => "test" },
}));

import {
  fetchRemoteRegistry,
  isAllowedRemoteHost,
  normalizeRegistryEntry,
  resetRemoteRegistryCacheForTests,
  toRemoteMarketplaceItems,
} from "./remoteRegistry";

const VALID_SHA256 = "a".repeat(64);
const GITHUB_REGISTRY_URL =
  "https://raw.githubusercontent.com/axon-editor/extensions/main/registry.json";

function registryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "axon.snake",
    name: "Snake",
    publisher: "axon",
    version: "1.0.0",
    kind: "view",
    source: "marketplace",
    installMode: "download",
    packageUrl:
      "https://raw.githubusercontent.com/axon-editor/extensions/main/dist/axon.snake-1.0.0.zip",
    sha256: VALID_SHA256,
    categories: ["game"],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AXON_EXTENSION_REGISTRY_URL;
  delete process.env.AXON_EXTENSION_ALLOWED_HOSTS;
});

describe("isAllowedRemoteHost", () => {
  it("accepts the trusted GitHub hosts over https", () => {
    expect(isAllowedRemoteHost(GITHUB_REGISTRY_URL)).toBe(true);
    expect(
      isAllowedRemoteHost(
        "https://objects.githubusercontent.com/axon-editor/extensions/dist/axon.snake.zip",
      ),
    ).toBe(true);
  });

  it("rejects non-https schemes and untrusted hosts", () => {
    expect(isAllowedRemoteHost("http://raw.githubusercontent.com/a/b.json")).toBe(false);
    expect(isAllowedRemoteHost("https://evil.example.com/registry.json")).toBe(false);
    expect(isAllowedRemoteHost("file:///etc/passwd")).toBe(false);
    expect(isAllowedRemoteHost("not a url")).toBe(false);
  });

  it("accepts hosts added through AXON_EXTENSION_ALLOWED_HOSTS", () => {
    process.env.AXON_EXTENSION_ALLOWED_HOSTS = "extensions.axon.dev, mirror.example.com";
    expect(isAllowedRemoteHost("https://extensions.axon.dev/index.json")).toBe(true);
    expect(isAllowedRemoteHost("https://mirror.example.com/x.zip")).toBe(true);
  });
});

describe("normalizeRegistryEntry", () => {
  it("accepts a complete download entry", () => {
    const entry = normalizeRegistryEntry(registryEntry());
    expect(entry).toMatchObject({
      id: "axon.snake",
      name: "Snake",
      publisher: "axon",
      version: "1.0.0",
      kind: "view",
      installMode: "download",
      sha256: VALID_SHA256,
    });
  });

  it("rejects download entries without id, version, or sha256", () => {
    expect(normalizeRegistryEntry(registryEntry({ id: "" }))).toBeNull();
    expect(normalizeRegistryEntry(registryEntry({ version: "" }))).toBeNull();
    expect(normalizeRegistryEntry(registryEntry({ sha256: "short" }))).toBeNull();
  });

  it("rejects download entries whose package points at an untrusted host", () => {
    expect(
      normalizeRegistryEntry(
        registryEntry({
          packageUrl: "https://evil.example.com/axon.snake.zip",
        }),
      ),
    ).toBeNull();
  });

  it("defaults an unknown kind to mixed and a missing publisher to community", () => {
    const entry = normalizeRegistryEntry(
      registryEntry({ kind: "browser-game", publisher: undefined }),
    );
    expect(entry?.kind).toBe("mixed");
    expect(entry?.publisher).toBe("community");
  });

  it("accepts copy entries without a package for schema compatibility", () => {
    const entry = normalizeRegistryEntry(
      registryEntry({
        installMode: "copy",
        packageUrl: undefined,
        sha256: undefined,
      }),
    );
    expect(entry?.installMode).toBe("copy");
    expect(entry?.packageUrl).toBeUndefined();
  });
});

describe("toRemoteMarketplaceItems", () => {
  it("maps registry entries and flags installed ids", () => {
    const items = toRemoteMarketplaceItems(
      { version: 1, extensions: [registryEntry() as never] },
      new Set(["axon.snake"]),
    );
    expect(items).toEqual([
      expect.objectContaining({
        id: "axon.snake",
        source: "remote",
        installed: true,
        contributionLabels: ["game"],
        themes: [],
      }),
    ]);
  });
});

describe("fetchRemoteRegistry", () => {
  beforeEach(() => {
    resetRemoteRegistryCacheForTests();
    process.env.AXON_EXTENSION_REGISTRY_URL = GITHUB_REGISTRY_URL;
  });

  it("parses a hosted registry and caches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      url: GITHUB_REGISTRY_URL,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          version: 1,
          extensions: [registryEntry()],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchRemoteRegistry();
    await fetchRemoteRegistry();

    expect(first.extensions).toHaveLength(1);
    expect(first.extensions[0].id).toBe("axon.snake");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when forceRefresh is requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      url: GITHUB_REGISTRY_URL,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({ version: 1, extensions: [registryEntry()] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchRemoteRegistry();
    await fetchRemoteRegistry({ forceRefresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when GitHub responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        url: GITHUB_REGISTRY_URL,
        headers: { get: () => null },
        text: async () => "",
      }),
    );

    await expect(fetchRemoteRegistry()).rejects.toThrow(/HTTP 404/);
  });

  it("rejects a registry that redirects to an untrusted host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "https://evil.example.com/registry.json",
        headers: { get: () => null },
        text: async () => "{}",
      }),
    );

    await expect(fetchRemoteRegistry()).rejects.toThrow(/redirected to an untrusted host/);
  });

  it("rejects a registry index over the size cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: GITHUB_REGISTRY_URL,
        headers: { get: () => "1073741824" },
        text: async () => "{}",
      }),
    );

    await expect(fetchRemoteRegistry()).rejects.toThrow(/too large/);
  });

  it("rejects a misconfigured registry URL before fetching", async () => {
    process.env.AXON_EXTENSION_REGISTRY_URL = "https://evil.example.com/registry.json";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRemoteRegistry()).rejects.toThrow(/not an allowed https host/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});