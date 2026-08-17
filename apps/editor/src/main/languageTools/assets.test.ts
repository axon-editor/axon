import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedLanguageToolCatalogEntry } from "./catalog";
import { getManagedLanguageToolPlatformKey } from "./catalog";

vi.mock("electron", () => ({
  app: { getVersion: () => "test" },
}));

import { ManagedLanguageToolAssetService } from "./assets";

describe("managed language tool release assets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts assets from SQLS's canonical repository after its owner move", async () => {
    const platformKey = getManagedLanguageToolPlatformKey();
    const checksum =
      "b44165ca597a4b4298d56657bc911aa3ca8a591befefde4e29566923c6229f3d";
    const assetName = "sqls-darwin-0.2.48.zip";
    const entry: ManagedLanguageToolCatalogEntry = {
      id: "sql",
      label: "SQL",
      languages: ["sql"],
      repository: "sqls-server/sqls",
      githubTag: "v0.2.48",
      expectedSha256ByPlatform: { [platformKey]: checksum },
      executableNames: ["sqls"],
      commandName: "sqls",
      windowsCommandName: "sqls.cmd",
      assetNames: { [platformKey]: assetName },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: "v0.2.48",
          assets: [
            {
              name: assetName,
              size: 10_731_807,
              digest: `sha256:${checksum}`,
              browser_download_url:
                "https://github.com/sqls-server/sqls/releases/download/v0.2.48/sqls-darwin-0.2.48.zip",
            },
          ],
        }),
      }),
    );

    // The resolver is where the original failure occurred: all release fields
    // were valid, but the old catalog owner made the trusted URL check reject
    // GitHub's canonical post-transfer asset URL. Asserting the resolved URL
    // protects both the catalog change and the security boundary that should
    // remain strict instead of permitting arbitrary redirected repositories.
    const service = new ManagedLanguageToolAssetService(() => undefined);
    await expect(
      service.resolveAsset(entry, new AbortController().signal),
    ).resolves.toMatchObject({
      checksum,
      downloadUrl:
        "https://github.com/sqls-server/sqls/releases/download/v0.2.48/sqls-darwin-0.2.48.zip",
      name: assetName,
      size: 10_731_807,
      version: "v0.2.48",
    });
  });
});
