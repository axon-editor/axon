import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function verifyReleaseVersion(workspaceRoot, releaseTag) {
  if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
    throw new Error(`Release tag must use vMAJOR.MINOR.PATCH: ${releaseTag}`);
  }

  const expectedVersion = releaseTag.slice(1);
  const rootManifest = readJson(path.join(workspaceRoot, "package.json"));
  const editorManifest = readJson(
    path.join(workspaceRoot, "apps", "editor", "package.json"),
  );
  const lockfile = readJson(path.join(workspaceRoot, "package-lock.json"));
  const versions = new Map([
    ["package.json", rootManifest.version],
    ["apps/editor/package.json", editorManifest.version],
    ["package-lock.json", lockfile.version],
    ["package-lock.json workspace root", lockfile.packages?.[""]?.version],
    [
      "package-lock.json editor workspace",
      lockfile.packages?.["apps/editor"]?.version,
    ],
  ]);

  const mismatches = [...versions].filter(
    ([, version]) => version !== expectedVersion,
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Release ${releaseTag} does not match:\n${mismatches
        .map(([file, version]) => `- ${file}: ${String(version)}`)
        .join("\n")}`,
    );
  }

  const releaseNotesPath = path.join(
    workspaceRoot,
    "docs",
    "releases",
    `${releaseTag}.md`,
  );
  if (!fs.existsSync(releaseNotesPath)) {
    throw new Error(`Release notes are missing: ${releaseNotesPath}`);
  }

  const githubPublisher = editorManifest.build?.publish?.find(
    (publisher) => publisher.provider === "github",
  );
  if (
    githubPublisher?.owner !== "axon-editor" ||
    githubPublisher?.repo !== "axon"
  ) {
    throw new Error(
      "Electron updater publishing must target axon-editor/axon before releasing.",
    );
  }

  return { releaseTag, expectedVersion, releaseNotesPath };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const releaseTag = process.argv[2]?.trim() ?? "";
  const result = verifyReleaseVersion(workspaceRoot, releaseTag);
  console.log(
    `verified ${result.releaseTag} against package manifests and release notes`,
  );
}
