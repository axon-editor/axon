import { describe, expect, it } from "vitest";
import {
  detectLanguageServerLanguage,
  detectMonacoLanguage,
} from "./languageDetection";

describe("structured language detection", () => {
  it.each(["xml", "xsd", "xsl", "xslt", "dtd", "svg"])(
    "maps .%s documents to XML",
    (extension) => {
      const filePath = `/workspace/schema.${extension}`;
      expect(detectMonacoLanguage(filePath)).toBe("xml");
      expect(detectLanguageServerLanguage(filePath)).toBe("xml");
    },
  );

  it("maps Protocol Buffers files to the proto language", () => {
    const filePath = "/workspace/api/service.proto";
    expect(detectMonacoLanguage(filePath)).toBe("proto");
    expect(detectLanguageServerLanguage(filePath)).toBe("proto");
  });

  it.each([
    ["Package.swift", "swift"],
    ["Gemfile", "ruby"],
    ["lib/task.rake", "ruby"],
    ["main.dart", "dart"],
    ["query.sql", "sql"],
    ["Cargo.toml", "toml"],
    ["main.zig", "zig"],
    ["build.zig.zon", "zig"],
    ["main.tf", "terraform"],
    ["variables.tfvars", "terraform"],
    ["tool.hcl", "hcl"],
    ["paper.tex", "latex"],
    ["references.bib", "bibtex"],
    ["Main.scala", "scala"],
    ["core.cljs", "clojure"],
    ["Main.hs", "haskell"],
    ["server.erl", "erlang"],
    ["analysis.R", "r"],
    ["profile.ps1", "powershell"],
    ["boot.asm", "asm"],
    ["Makefile", "makefile"],
    ["GNUmakefile", "makefile"],
  ])("maps %s to %s", (filePath, languageId) => {
    expect(detectMonacoLanguage(`/workspace/${filePath}`)).toBe(languageId);
    expect(detectLanguageServerLanguage(`/workspace/${filePath}`)).toBe(languageId);
  });
});
