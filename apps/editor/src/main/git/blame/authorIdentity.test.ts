/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveGitAuthorAvatars,
  resolveGitAuthorIdentity,
} from "./authorIdentity";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Git author identity", () => {
  it("resolves a GitHub noreply address to a verified profile and avatar", () => {
    expect(
      resolveGitAuthorIdentity("12345+GordenArcher@users.noreply.github.com"),
    ).toEqual({
      avatarUrl:
        "https://avatars.githubusercontent.com/u/e?email=12345%2Bgordenarcher%40users.noreply.github.com&s=96&d=404",
      profileUrl: "https://github.com/gordenarcher",
    });
  });

  it("resolves an old-style GitHub noreply address without an id prefix", () => {
    expect(
      resolveGitAuthorIdentity("octocat@users.noreply.github.com"),
    ).toEqual({
      avatarUrl:
        "https://avatars.githubusercontent.com/u/e?email=octocat%40users.noreply.github.com&s=96&d=404",
      profileUrl: "https://github.com/octocat",
    });
  });

  it("skips GitHub bot noreply addresses", () => {
    expect(
      resolveGitAuthorIdentity("12345+bad-pix[bot]@users.noreply.github.com"),
    ).toEqual({
      avatarUrl: "",
      profileUrl: "",
    });
  });

  it("uses Gravatar without guessing a profile for a regular email", () => {
    const identity = resolveGitAuthorIdentity("gorden@example.com");

    expect(identity.avatarUrl).toMatch(
      /^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?s=96&d=404$/,
    );
    expect(identity.profileUrl).toBe("");
  });

  it("returns no remote identity when the commit has no email", () => {
    expect(resolveGitAuthorIdentity(" ")).toEqual({
      avatarUrl: "",
      profileUrl: "",
    });
  });
});

describe("Git author avatar probing", () => {
  it("uses the GitHub CDN when the CDN resolves the email to a real avatar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/jpeg" },
      }),
    );

    const identities = await resolveGitAuthorAvatars([
      "archergorden@gmail.com",
    ]);
    const identity = identities.get("archergorden@gmail.com");

    expect(identity).toEqual({
      avatarUrl:
        "https://avatars.githubusercontent.com/u/e?email=archergorden%40gmail.com&s=96&d=404",
      profileUrl: "",
    });
  });

  it("keeps Gravatar when the CDN only has a default placeholder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/png" },
      }),
    );

    const identities = await resolveGitAuthorAvatars([
      "someone@example.com",
    ]);
    const identity = identities.get("someone@example.com");

    expect(identity?.avatarUrl).toMatch(/^https:\/\/www\.gravatar\.com\//);
    expect(identity?.profileUrl).toBe("");
  });

  it("keeps Gravatar when probing the CDN fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => "image/png" },
      }),
    );

    const identities = await resolveGitAuthorAvatars([
      "offline@example.com",
    ]);
    const identity = identities.get("offline@example.com");

    expect(identity?.avatarUrl).toMatch(/^https:\/\/www\.gravatar\.com\//);
  });

  it("caches a resolved probe for the TTL window", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const email = "cached-probe@example.com";
    const first = await resolveGitAuthorAvatars([email]);
    const second = await resolveGitAuthorAvatars([email]);

    expect(first.get(email)?.avatarUrl).toContain("avatars.githubusercontent.com");
    expect(second.get(email)?.avatarUrl).toBe(first.get(email)?.avatarUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("upgrades the sync resolver result once the probe confirms the email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/jpeg" },
      }),
    );

    const email = "probe-first@example.com";
    await resolveGitAuthorAvatars([email]);

    expect(resolveGitAuthorIdentity(email).avatarUrl).toContain(
      "avatars.githubusercontent.com",
    );
  });

  it("still probes when a sync heuristic is already cached", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const email = "heuristic-cached@example.com";
    expect(resolveGitAuthorIdentity(email).avatarUrl).toMatch(
      /^https:\/\/www\.gravatar\.com\//,
    );

    const identities = await resolveGitAuthorAvatars([email]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(identities.get(email)?.avatarUrl).toContain(
      "avatars.githubusercontent.com",
    );
  });
});