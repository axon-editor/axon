import { describe, expect, it } from "vitest";
import {
  MANAGED_LANGUAGE_TOOL_CATALOG,
  findManagedLanguageToolAssetName,
  getManagedLanguageToolCatalogEntry,
  getManagedLanguageToolForLanguage,
} from "./catalog";

describe("managed language tool catalog", () => {
  it("recommends Protols only for Protocol Buffers documents", () => {
    expect(getManagedLanguageToolForLanguage("proto")?.id).toBe("proto");
    expect(getManagedLanguageToolForLanguage("PROTO")?.id).toBe("proto");
    expect(getManagedLanguageToolForLanguage("xml")?.id).toBe("xml");
  });

  it("defines exact platform assets for stable upstream names", () => {
    const protols = getManagedLanguageToolCatalogEntry("proto");
    expect(protols?.assetNames["darwin-arm64"]).toBe(
      "protols-aarch64-apple-darwin.tar.gz",
    );
    expect(protols?.assetNames["win32-x64"]).toBe(
      "protols-x86_64-pc-windows-msvc.zip",
    );
  });

  it("limits versioned release matching to reviewed platform patterns", () => {
    const clangd = getManagedLanguageToolCatalogEntry("cpp");
    if (!clangd) throw new Error("clangd catalog entry is missing");

    expect(
      findManagedLanguageToolAssetName(clangd, [
        "clangd-mac-21.1.2.zip",
        "clangd-linux-21.1.2.zip",
        "source.zip",
      ], "darwin-arm64"),
    ).toBe("clangd-mac-21.1.2.zip");
  });

  it("keeps Go out of managed downloads because gopls is packaged", () => {
    expect(getManagedLanguageToolForLanguage("go")).toBeNull();
  });

  it("pins every GitHub platform asset to a reviewed checksum", () => {
    for (const entry of MANAGED_LANGUAGE_TOOL_CATALOG) {
      if (!entry.repository || entry.pinnedGithubAsset) continue;
      expect(entry.githubTag, entry.id).toBeTruthy();
      const platformKeys = new Set([
        ...Object.keys(entry.assetNames),
        ...Object.keys(entry.assetPatterns ?? {}),
      ]);
      for (const platformKey of platformKeys) {
        expect(
          entry.expectedSha256ByPlatform?.[platformKey],
          `${entry.id}:${platformKey}`,
        ).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it("uses Red Hat's native XML server instead of requiring Java", () => {
    const xml = getManagedLanguageToolCatalogEntry("xml");
    expect(xml?.assetNames["darwin-arm64"]).toBe(
      "lemminx-osx-aarch_64.zip",
    );
    expect(xml?.executableNames).toContain("lemminx");
  });

  it("pins Kotlin and shares Java's managed runtime", () => {
    const kotlin = getManagedLanguageToolCatalogEntry("kotlin");
    expect(kotlin?.pinnedGithubAsset?.tag).toBe("1.3.13");
    expect(kotlin?.pinnedGithubAsset?.sha256).toHaveLength(64);
    expect(kotlin?.dependencies).toEqual(["java"]);
  });

  it("keeps the private .NET SDK hidden behind the C# installation", () => {
    const csharp = getManagedLanguageToolCatalogEntry("csharp");
    const dotnet = getManagedLanguageToolCatalogEntry("dotnet-sdk");
    expect(csharp?.dependencies).toEqual(["dotnet-sdk"]);
    expect(dotnet?.hidden).toBe(true);
    expect(dotnet?.dotnetSdk?.version).toBe("8.0.423");
  });
});
