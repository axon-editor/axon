import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(label: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

async function loadReleaseScript<T>(fileName: string) {
  const scriptPath = path.resolve(process.cwd(), "scripts", fileName);
  return (await import(pathToFileURL(scriptPath).href)) as T;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("release version verification", () => {
  it("rejects a tag that differs from any package manifest", async () => {
    const workspaceRoot = await createTemporaryDirectory("axon-release-version");
    await fs.mkdir(path.join(workspaceRoot, "apps", "editor"), {
      recursive: true,
    });
    await fs.mkdir(path.join(workspaceRoot, "docs", "releases"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ version: "2.0.0" }),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "apps", "editor", "package.json"),
      JSON.stringify({
        version: "1.9.9",
        build: {
          publish: [{ provider: "github", owner: "axon-editor", repo: "axon" }],
        },
      }),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "package-lock.json"),
      JSON.stringify({
        version: "2.0.0",
        packages: {
          "": { version: "2.0.0" },
          "apps/editor": { version: "2.0.0" },
        },
      }),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "docs", "releases", "v2.0.0.md"),
      "release notes",
    );

    const { verifyReleaseVersion } = await loadReleaseScript<{
      verifyReleaseVersion: (root: string, tag: string) => unknown;
    }>("verify-release-version.mjs");

    expect(() => verifyReleaseVersion(workspaceRoot, "v2.0.0")).toThrow(
      "apps/editor/package.json: 1.9.9",
    );
  });
});

describe("release asset aggregation", () => {
  it("merges Mac architecture metadata and excludes builder diagnostics", async () => {
    const root = await createTemporaryDirectory("axon-release-assets");
    const inputPath = path.join(root, "input");
    const outputPath = path.join(root, "output");
    const x64Path = path.join(inputPath, "release-macos-x64");
    const arm64Path = path.join(inputPath, "release-macos-arm64");
    await fs.mkdir(x64Path, { recursive: true });
    await fs.mkdir(arm64Path, { recursive: true });

    const metadata = (zipName: string, dmgName: string) =>
      YAML.stringify({
        version: "2.0.0",
        files: [
          { url: zipName, sha512: `${zipName}-hash`, size: 10 },
          { url: dmgName, sha512: `${dmgName}-hash`, size: 20 },
        ],
        path: zipName,
        sha512: `${zipName}-hash`,
        releaseDate: "2026-08-30T00:00:00.000Z",
      });
    const assets = [
      [x64Path, "Axon-2.0.0-mac.zip", "Axon-2.0.0.dmg"],
      [arm64Path, "Axon-2.0.0-arm64-mac.zip", "Axon-2.0.0-arm64.dmg"],
    ] as const;
    for (const [directory, zipName, dmgName] of assets) {
      await fs.writeFile(path.join(directory, zipName), zipName);
      await fs.writeFile(path.join(directory, dmgName), dmgName);
      await fs.writeFile(
        path.join(directory, "latest-mac.yml"),
        metadata(zipName, dmgName),
      );
    }
    await fs.writeFile(
      path.join(x64Path, "builder-debug.yml"),
      "private build diagnostics",
    );

    const { prepareReleaseAssets } = await loadReleaseScript<{
      prepareReleaseAssets: (
        input: string,
        output: string,
      ) => Promise<{ assetNames: string[] }>;
    }>("prepare-release-assets.mjs");
    const result = await prepareReleaseAssets(inputPath, outputPath);
    const merged = YAML.parse(
      await fs.readFile(path.join(outputPath, "latest-mac.yml"), "utf8"),
    ) as { files: Array<{ url: string }> };

    expect(merged.files.map((file) => file.url)).toEqual([
      "Axon-2.0.0-arm64-mac.zip",
      "Axon-2.0.0-arm64.dmg",
      "Axon-2.0.0-mac.zip",
      "Axon-2.0.0.dmg",
    ]);
    expect(result.assetNames).not.toContain("builder-debug.yml");
    await expect(
      fs.access(path.join(outputPath, "builder-debug.yml")),
    ).rejects.toThrow();
  });
});
