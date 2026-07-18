import { describe, expect, it } from "vitest";
import { type LanguageServerStatus } from "../../../shared/lsp";
import { serverMatchesLanguage } from "../../../../../../extensions/builtin/language-tools/workbench/lib/workspaceLanguageTools";

function createServer(
  id: LanguageServerStatus["id"],
  languages: string[],
): LanguageServerStatus {
  return {
    id,
    label: id,
    languages,
    status: "available",
    available: true,
    relevant: false,
    running: false,
    startable: true,
    bundled: false,
    command: id,
    detail: "",
    installHint: "",
  };
}

describe("workspace language tools", () => {
  it("matches a server through its protocol id", () => {
    expect(
      serverMatchesLanguage(
        createServer("proto", ["Protocol Buffers"]),
        "proto",
      ),
    ).toBe(true);
  });

  it("matches Monaco React language ids to their server aliases", () => {
    expect(
      serverMatchesLanguage(
        createServer("typescript", ["TypeScript", "TSX"]),
        "typescriptreact",
      ),
    ).toBe(true);
  });
});
