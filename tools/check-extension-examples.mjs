import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const examplesRoot = path.join(workspaceRoot, "examples", "extensions");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.relative(workspaceRoot, filePath)}: ${message}`);
  }
}

function findManifestPaths(directoryPath) {
  const manifests = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(entryPath, "axon.extension.json");
    if (fs.existsSync(manifestPath)) {
      manifests.push(manifestPath);
      continue;
    }
    manifests.push(...findManifestPaths(entryPath));
  }
  return manifests;
}

function assertIdentity(manifestPath, manifest) {
  for (const field of ["id", "name", "publisher", "version"]) {
    if (typeof manifest[field] === "string" && manifest[field].trim()) continue;
    throw new Error(
      `${path.relative(workspaceRoot, manifestPath)} is missing ${field}.`,
    );
  }
}

function assertAsset(extensionPath, manifestPath, assetPath, label) {
  if (typeof assetPath !== "string" || !assetPath.trim()) {
    throw new Error(
      `${path.relative(workspaceRoot, manifestPath)} has an empty ${label} path.`,
    );
  }

  const resolvedPath = path.resolve(extensionPath, assetPath);
  const relativePath = path.relative(extensionPath, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(
      `${path.relative(workspaceRoot, manifestPath)} ${label} escapes its extension folder.`,
    );
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `${path.relative(workspaceRoot, manifestPath)} ${label} is missing: ${assetPath}`,
    );
  }
}

function validateManifest(manifestPath, extensionIds) {
  const extensionPath = path.dirname(manifestPath);
  const manifest = readJson(manifestPath);
  assertIdentity(manifestPath, manifest);

  if (extensionIds.has(manifest.id)) {
    throw new Error(`Duplicate example extension id: ${manifest.id}`);
  }
  extensionIds.add(manifest.id);

  const contributes = manifest.contributes ?? {};
  for (const theme of contributes.themes ?? []) {
    assertAsset(extensionPath, manifestPath, theme.path, "theme");
    const definition = readJson(path.resolve(extensionPath, theme.path));
    if (definition.id !== theme.id) {
      throw new Error(
        `${manifest.id} contributes theme ${theme.id}, but its file declares ${definition.id ?? "no id"}.`,
      );
    }
  }
  for (const iconTheme of [
    ...(contributes.iconThemes ?? []),
    ...(contributes.icons ?? []),
  ]) {
    assertAsset(extensionPath, manifestPath, iconTheme.path, "icon theme");
  }
  for (const snippet of contributes.snippets ?? []) {
    assertAsset(extensionPath, manifestPath, snippet.path, "snippet");
    readJson(path.resolve(extensionPath, snippet.path));
  }
  for (const language of contributes.languages ?? []) {
    if (!language.configuration) continue;
    assertAsset(
      extensionPath,
      manifestPath,
      language.configuration,
      "language configuration",
    );
    readJson(path.resolve(extensionPath, language.configuration));
  }

  // Runtime examples intentionally do not commit generated `dist` files. A
  // manifest with `main` must therefore provide a TypeScript build definition
  // and source entry, while the separate tsc check proves that source can
  // produce the declared CommonJS module without weakening this asset check.
  if (manifest.main) {
    assertAsset(extensionPath, manifestPath, "tsconfig.json", "runtime tsconfig");
    assertAsset(extensionPath, manifestPath, "src/extension.ts", "runtime source");
  }
}

if (!fs.existsSync(examplesRoot)) {
  throw new Error("examples/extensions is missing.");
}

const manifestPaths = findManifestPaths(examplesRoot);
const extensionIds = new Set();
for (const manifestPath of manifestPaths) {
  validateManifest(manifestPath, extensionIds);
}

console.log(`Validated ${manifestPaths.length} Axon extension examples.`);
