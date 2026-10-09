/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from "crypto";

export interface GitAuthorIdentity {
  avatarUrl: string;
  profileUrl: string;
}

const GITHUB_AVATAR_SIZE = 96;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

interface IdentityCacheEntry {
  identity: GitAuthorIdentity;
  expiresAt: number;
  probed: boolean;
}

const identityCache = new Map<string, IdentityCacheEntry>();
const inflightProbes = new Map<string, Promise<string | null>>();

function githubAvatarEmailCdnUrl(email: string): string {
  return `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(
    email,
  )}&s=${GITHUB_AVATAR_SIZE}&d=404`;
}

function githubUsernameFromNoreply(email: string): string {
  return email.replace(/^\d+\+/, "").split("@")[0];
}

function isGithubBotNoreply(email: string): boolean {
  return /\[bot\]@users\.noreply\.github\.com$/.test(email);
}

function githubProfileUrl(email: string): string {
  if (!email.endsWith("@users.noreply.github.com")) return "";
  const username = githubUsernameFromNoreply(email);
  return username ? `https://github.com/${username}` : "";
}

function resolveHeuristicIdentity(email: string): GitAuthorIdentity {
  if (email.endsWith("@users.noreply.github.com")) {
    if (isGithubBotNoreply(email)) {
      return { avatarUrl: "", profileUrl: "" };
    }
    return {
      avatarUrl: githubAvatarEmailCdnUrl(email),
      profileUrl: githubProfileUrl(email),
    };
  }

  // A commit stores an author name and email, but it does not store an account
  // URL. Gravatar can resolve the email to a real image without pretending that
  // the author's display name is a GitHub username. I intentionally leave the
  // profile URL empty here because opening a guessed account would be worse than
  // showing no link.
  const emailHash = crypto
    .createHash("md5")
    .update(email)
    .digest("hex");
  return {
    avatarUrl: `https://www.gravatar.com/avatar/${emailHash}?s=96&d=404`,
    profileUrl: "",
  };
}

function rememberIdentity(
  email: string,
  identity: GitAuthorIdentity,
  now: number,
  probed: boolean,
): void {
  if (identityCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = identityCache.keys().next().value;
    if (oldestKey !== undefined) identityCache.delete(oldestKey);
  }
  identityCache.set(email, { identity, expiresAt: now + CACHE_TTL_MS, probed });
}

export function resolveGitAuthorIdentity(
  authorEmail: string,
): GitAuthorIdentity {
  const normalizedEmail = authorEmail.trim().toLowerCase();
  if (!normalizedEmail) return { avatarUrl: "", profileUrl: "" };

  const now = Date.now();
  const cached = identityCache.get(normalizedEmail);
  if (cached && cached.expiresAt > now) {
    return cached.identity;
  }

  const identity = resolveHeuristicIdentity(normalizedEmail);
  rememberIdentity(normalizedEmail, identity, now, false);
  return identity;
}

async function doesGithubKnowEmail(email: string): Promise<string | null> {
  const githubAvatarUrl = githubAvatarEmailCdnUrl(email);
  try {
    const response = await fetch(githubAvatarUrl, { redirect: "follow" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("image/jpeg") ? githubAvatarUrl : null;
  } catch {
    return null;
  }
}

export async function resolveGitAuthorAvatars(
  emails: readonly string[],
): Promise<Map<string, GitAuthorIdentity>> {
  const now = Date.now();
  const uniqueEmails = [
    ...new Set(
      emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
    ),
  ];

  const identities = new Map<string, GitAuthorIdentity>();
  const probes: Promise<void>[] = [];

  for (const email of uniqueEmails) {
    const cached = identityCache.get(email);
    if (cached && cached.probed && cached.expiresAt > now) {
      identities.set(email, cached.identity);
      continue;
    }

    let inflight = inflightProbes.get(email);
    if (!inflight) {
      inflight = doesGithubKnowEmail(email).finally(() => {
        inflightProbes.delete(email);
      });
      inflightProbes.set(email, inflight);
    }

    probes.push(
      inflight.then((githubAvatarUrl) => {
        const identity = githubAvatarUrl
          ? { avatarUrl: githubAvatarUrl, profileUrl: githubProfileUrl(email) }
          : resolveHeuristicIdentity(email);
        rememberIdentity(email, identity, Date.now(), true);
        identities.set(email, identity);
      }),
    );
  }

  await Promise.all(probes);
  return identities;
}