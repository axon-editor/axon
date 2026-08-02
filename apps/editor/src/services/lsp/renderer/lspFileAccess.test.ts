import { describe, expect, it } from "vitest";
import {
  canUseWorkspaceLanguageTools,
  registerExternalLanguageToolFile,
} from "./lspFileAccess";

describe("renderer LSP file access", () => {
  it("accepts workspace files and individually registered external sources", () => {
    expect(
      canUseWorkspaceLanguageTools(
        "/workspace/project/main.go",
        "/workspace/project",
      ),
    ).toBe(true);
    expect(
      canUseWorkspaceLanguageTools(
        "/usr/local/go/src/os/dir.go",
        "/workspace/project",
      ),
    ).toBe(false);

    registerExternalLanguageToolFile("/usr/local/go/src/os/dir.go");

    // Registering the definition must unlock Monaco providers only for that
    // model. A neighboring standard-library file still needs its own LSP result
    // before hover, semantic tokens, or navigation can query project tooling.
    expect(
      canUseWorkspaceLanguageTools(
        "/usr/local/go/src/os/dir.go",
        "/workspace/project",
      ),
    ).toBe(true);
    expect(
      canUseWorkspaceLanguageTools(
        "/usr/local/go/src/os/file.go",
        "/workspace/project",
      ),
    ).toBe(false);
  });
});
