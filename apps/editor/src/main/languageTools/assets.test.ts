import { createHash } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
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
    vi.useRealTimers();
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

  it("restarts a stalled download and replaces its partial archive", async () => {
    vi.useFakeTimers();
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "axon-language-tool-download-"),
    );
    const destination = path.join(directory, "clangd.zip");
    const payload = Buffer.from("complete clangd archive");
    const checksum = createHash("sha256").update(payload).digest("hex");
    const downloadUrl =
      "https://github.com/clangd/clangd/releases/download/22.1.6/clangd-mac-22.1.6.zip";
    const progress = vi.fn();
    let request = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (_url: string, init: { signal: AbortSignal }) => {
          request += 1;
          if (request === 1) {
            let readCount = 0;
            return {
              ok: true,
              status: 200,
              url: downloadUrl,
              body: {
                getReader: () => ({
                  read: () => {
                    readCount += 1;
                    if (readCount === 1) {
                      return Promise.resolve({
                        done: false,
                        value: payload.subarray(0, 8),
                      });
                    }
                    return new Promise((_resolve, reject) => {
                      init.signal.addEventListener(
                        "abort",
                        () => reject(init.signal.reason),
                        { once: true },
                      );
                    });
                  },
                  cancel: vi.fn().mockResolvedValue(undefined),
                }),
              },
            };
          }

          let delivered = false;
          return {
            ok: true,
            status: 200,
            url: downloadUrl,
            body: {
              getReader: () => ({
                read: () => {
                  if (delivered) return Promise.resolve({ done: true });
                  delivered = true;
                  return Promise.resolve({ done: false, value: payload });
                },
                cancel: vi.fn().mockResolvedValue(undefined),
              }),
            },
          };
        },
      ),
    );

    const entry: ManagedLanguageToolCatalogEntry = {
      id: "cpp",
      label: "C / C++",
      languages: ["c", "cpp"],
      repository: "clangd/clangd",
      githubTag: "22.1.6",
      expectedSha256ByPlatform: {},
      executableNames: ["clangd"],
      commandName: "clangd",
      windowsCommandName: "clangd.cmd",
      assetNames: {},
    };
    const service = new ManagedLanguageToolAssetService(progress, {
      downloadIdleTimeoutMs: 1_000,
      downloadMaxAttempts: 2,
    });

    try {
      const download = service.downloadAsset(
        entry,
        {
          version: "22.1.6",
          name: "clangd-mac-22.1.6.zip",
          size: payload.byteLength,
          hashAlgorithm: "sha256",
          checksum,
          downloadUrl,
        },
        destination,
        null,
        new AbortController().signal,
      );

      // The first response deliberately emits a prefix and then never closes.
      // Advancing past the idle window proves that the watchdog breaks the
      // pending body read. The second response must start at byte zero so the
      // partial prefix cannot survive into the checksum-verified archive.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_001);
      await expect(download).resolves.toBeUndefined();
      await expect(fs.readFile(destination)).resolves.toEqual(payload);
      expect(request).toBe(2);
      expect(progress).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          id: "cpp",
          phase: "downloading",
          percent: 0,
          message: expect.stringContaining("Retrying automatically (2/2)"),
        }),
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
