import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";

const UPDATER_METADATA_NAMES = new Set([
  "latest.yml",
  "latest-linux.yml",
]);
const RELEASE_ASSET_EXTENSIONS = new Set([
  ".dmg",
  ".zip",
  ".exe",
  ".AppImage",
  ".deb",
  ".blockmap",
]);

async function listFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootPath, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return nestedFiles.flat();
}

function isReleaseAsset(fileName) {
  if (UPDATER_METADATA_NAMES.has(fileName)) return true;
  return [...RELEASE_ASSET_EXTENSIONS].some((extension) =>
    fileName.endsWith(extension),
  );
}

async function copyUniqueAsset(sourcePath, outputPath, copiedNames) {
  const fileName = path.basename(sourcePath);
  if (copiedNames.has(fileName)) {
    throw new Error(`Duplicate release asset would be overwritten: ${fileName}`);
  }
  copiedNames.add(fileName);
  await fs.copyFile(sourcePath, path.join(outputPath, fileName));
}

function mergeMacMetadata(documents) {
  if (documents.length < 2) {
    throw new Error(
      "Mac releases require metadata from both x64 and arm64 build jobs.",
    );
  }

  const versions = new Set(documents.map((document) => document.version));
  if (versions.size !== 1 || versions.has(undefined)) {
    throw new Error("Mac updater metadata versions do not match.");
  }

  const files = new Map();
  for (const document of documents) {
    for (const file of document.files ?? []) {
      if (!file?.url || !file?.sha512) {
        throw new Error("Mac updater metadata contains an incomplete file.");
      }
      const existing = files.get(file.url);
      if (existing && JSON.stringify(existing) !== JSON.stringify(file)) {
        throw new Error(`Mac updater metadata conflicts for ${file.url}.`);
      }
      files.set(file.url, file);
    }
  }

  const zipNames = [...files.keys()].filter((name) => name.endsWith(".zip"));
  const arm64Zip = zipNames.find((name) => name.includes("arm64"));
  const x64Zip = zipNames.find((name) => !name.includes("arm64"));
  if (!arm64Zip || !x64Zip) {
    throw new Error(
      "Merged Mac updater metadata must contain arm64 and x64 ZIP files.",
    );
  }

  const primaryDocument =
    documents.find((document) => !String(document.path).includes("arm64")) ??
    documents[0];
  const releaseDates = documents
    .map((document) => document.releaseDate)
    .filter(Boolean)
    .sort();

  return {
    ...primaryDocument,
    files: [...files.values()].sort((left, right) =>
      left.url.localeCompare(right.url),
    ),
    path: x64Zip,
    sha512: files.get(x64Zip).sha512,
    releaseDate: releaseDates.at(-1),
  };
}

export async function prepareReleaseAssets(inputPath, outputPath) {
  const existingOutput = await fs.readdir(outputPath).catch(() => []);
  if (existingOutput.length > 0) {
    throw new Error(`Release output directory is not empty: ${outputPath}`);
  }
  await fs.mkdir(outputPath, { recursive: true });

  const copiedNames = new Set();
  const macMetadata = [];
  for (const sourcePath of await listFiles(inputPath)) {
    const fileName = path.basename(sourcePath);
    if (fileName === "latest-mac.yml") {
      macMetadata.push(YAML.parse(await fs.readFile(sourcePath, "utf8")));
      continue;
    }
    if (!isReleaseAsset(fileName)) continue;
    await copyUniqueAsset(sourcePath, outputPath, copiedNames);
  }

  const mergedMacMetadata = mergeMacMetadata(macMetadata);
  for (const file of mergedMacMetadata.files) {
    if (!copiedNames.has(file.url)) {
      throw new Error(
        `Mac updater metadata references a missing release asset: ${file.url}`,
      );
    }
  }
  await fs.writeFile(
    path.join(outputPath, "latest-mac.yml"),
    YAML.stringify(mergedMacMetadata, { lineWidth: 0 }),
    "utf8",
  );

  return {
    assetNames: [...copiedNames, "latest-mac.yml"].sort(),
    macMetadata: mergedMacMetadata,
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const inputPath = path.resolve(process.argv[2] ?? "release-inputs");
  const outputPath = path.resolve(process.argv[3] ?? "release-assets");
  const result = await prepareReleaseAssets(inputPath, outputPath);
  console.log(`prepared ${result.assetNames.length} release assets`);
}
