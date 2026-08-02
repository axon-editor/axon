import { describe, expect, it } from "vitest";
import { resolveGitAuthorIdentity } from "./authorIdentity";

describe("Git author identity", () => {
  it("resolves a GitHub noreply address to a verified profile and avatar", () => {
    expect(
      resolveGitAuthorIdentity("12345+GordenArcher@users.noreply.github.com"),
    ).toEqual({
      avatarUrl: "https://github.com/gordenarcher.png?size=96",
      profileUrl: "https://github.com/gordenarcher",
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
