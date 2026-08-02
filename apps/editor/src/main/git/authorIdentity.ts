import crypto from "crypto";

export interface GitAuthorIdentity {
  avatarUrl: string;
  profileUrl: string;
}

export function resolveGitAuthorIdentity(
  authorEmail: string,
): GitAuthorIdentity {
  const normalizedEmail = authorEmail.trim().toLowerCase();
  if (!normalizedEmail) return { avatarUrl: "", profileUrl: "" };

  const githubNoreplyMatch = normalizedEmail.match(
    /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/,
  );
  if (githubNoreplyMatch?.[1]) {
    const username = githubNoreplyMatch[1];
    return {
      avatarUrl: `https://github.com/${username}.png?size=96`,
      profileUrl: `https://github.com/${username}`,
    };
  }

  // A commit stores an author name and email, but it does not store an account
  // URL. Gravatar can resolve the email to a real image without pretending that
  // the author's display name is a GitHub username. I intentionally leave the
  // profile URL empty here because opening a guessed account would be worse than
  // showing no link.
  const emailHash = crypto
    .createHash("md5")
    .update(normalizedEmail)
    .digest("hex");
  return {
    avatarUrl: `https://www.gravatar.com/avatar/${emailHash}?s=96&d=404`,
    profileUrl: "",
  };
}
