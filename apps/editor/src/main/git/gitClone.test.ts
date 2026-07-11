import { describe, expect, it } from "vitest";
import {
  parseGitCloneProgressLine,
  validateGitCloneRepositoryUrl,
} from "./clone";

describe("validateGitCloneRepositoryUrl", () => {
  it("accepts HTTPS and SCP-style SSH repository URLs", () => {
    expect(
      validateGitCloneRepositoryUrl(
        "https://github.com/GordenArcher/axon.git",
      ),
    ).toMatchObject({ ok: true, name: "axon" });
    expect(
      validateGitCloneRepositoryUrl("git@github.com:GordenArcher/axon.git"),
    ).toMatchObject({ ok: true, name: "axon" });
  });

  it("rejects command options, local paths, and remote helpers", () => {
    expect(validateGitCloneRepositoryUrl("--upload-pack=payload").ok).toBe(
      false,
    );
    expect(validateGitCloneRepositoryUrl("../../private-repository").ok).toBe(
      false,
    );
    expect(validateGitCloneRepositoryUrl("ext::sh -c payload").ok).toBe(false);
    expect(validateGitCloneRepositoryUrl({ repository: "invalid" }).ok).toBe(
      false,
    );
  });

  it("rejects embedded HTTPS credentials", () => {
    const result = validateGitCloneRepositoryUrl(
      "https://user:secret@github.com/owner/project.git",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("credential helper");
  });

  it("rejects target names that are not portable across Axon platforms", () => {
    expect(validateGitCloneRepositoryUrl("https://example.com/CON.git").ok).toBe(
      false,
    );
    expect(
      validateGitCloneRepositoryUrl("https://example.com/project%2A.git").ok,
    ).toBe(false);
  });
});

describe("parseGitCloneProgressLine", () => {
  it("normalizes Git receive and resolve percentages", () => {
    expect(
      parseGitCloneProgressLine("Receiving objects: 42% (42/100)"),
    ).toEqual({
      phase: "receiving",
      percent: 42,
      message: "Receiving objects",
    });
    expect(
      parseGitCloneProgressLine("Resolving deltas: 100% (20/20), done."),
    ).toEqual({
      phase: "resolving",
      percent: 100,
      message: "Resolving deltas",
    });
  });

  it("normalizes remote counting and compression phases", () => {
    expect(
      parseGitCloneProgressLine("remote: Counting objects: 180, done."),
    ).toMatchObject({ phase: "counting", message: "Counting objects" });
    expect(
      parseGitCloneProgressLine("remote: Compressing objects: 75% (30/40)"),
    ).toMatchObject({ phase: "compressing", message: "Compressing objects" });
  });
});
