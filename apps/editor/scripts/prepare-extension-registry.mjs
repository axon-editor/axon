import fs from "node:fs";
import path from "node:path";

const editorRoot = process.cwd();
const workspaceRoot = path.resolve(editorRoot, "..", "..");
const manifestFile = "axon.extension.json";
const extensionRoots = [
  path.resolve(workspaceRoot, "extensions/builtin"),
  path.resolve(workspaceRoot, "extensions/marketplace"),
];
const staticAssetMirrors = [
  {
    source: path.resolve(
      workspaceRoot,
      "extensions/builtin/icons/catppuccin/assets",
    ),
    target: path.resolve(
      editorRoot,
      "public/extensions/builtin/icons/catppuccin/assets",
    ),
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findExtensionDirectories(rootPath) {
  if (!fs.existsSync(rootPath)) return [];

  const extensionDirectories = [];
  const visit = (currentPath) => {
    const manifestPath = path.join(currentPath, manifestFile);
    if (fs.existsSync(manifestPath)) {
      extensionDirectories.push(currentPath);
      return;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      visit(path.join(currentPath, entry.name));
    }
  };

  visit(rootPath);
  return extensionDirectories;
}

function assertContributionPath(extensionPath, manifest, contribution, label) {
  if (!contribution?.path) return;

  const targetPath = path.resolve(extensionPath, contribution.path);
  if (!targetPath.startsWith(extensionPath)) {
    throw new Error(
      `${manifest.id} ${label} escapes the extension folder: ${contribution.path}`,
    );
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `${manifest.id} ${label} points at a missing file: ${contribution.path}`,
    );
  }
}

function validateManifest(extensionPath) {
  const manifestPath = path.join(extensionPath, manifestFile);
  const manifest = readJson(manifestPath);
  const contributes = manifest.contributes ?? {};

  if (!manifest.id || !manifest.name || !manifest.publisher || !manifest.version) {
    throw new Error(`${manifestPath} is missing required extension identity fields.`);
  }

  for (const theme of contributes.themes ?? []) {
    assertContributionPath(extensionPath, manifest, theme, "theme");
  }
  for (const iconTheme of [
    ...(contributes.iconThemes ?? []),
    ...(contributes.icons ?? []),
  ]) {
    assertContributionPath(extensionPath, manifest, iconTheme, "icon theme");
  }
  for (const snippet of contributes.snippets ?? []) {
    assertContributionPath(extensionPath, manifest, snippet, "snippet");
  }
  for (const language of contributes.languages ?? []) {
    if (language.configuration) {
      assertContributionPath(extensionPath, manifest, {
        path: language.configuration,
      }, "language configuration");
    }
  }

  return manifest;
}

function newestMtime(directoryPath) {
  if (!fs.existsSync(directoryPath)) return 0;

  let newest = 0;
  const visit = (currentPath) => {
    const stats = fs.statSync(currentPath);
    newest = Math.max(newest, stats.mtimeMs);
    if (!stats.isDirectory()) return;

    for (const entry of fs.readdirSync(currentPath)) {
      visit(path.join(currentPath, entry));
    }
  };

  visit(directoryPath);
  return newest;
}

function mirrorDirectoryIfStale(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`missing extension asset source: ${sourcePath}`);
  }

  const sourceMtime = newestMtime(sourcePath);
  const targetMtime = newestMtime(targetPath);
  if (targetMtime >= sourceMtime) return false;

  // Vite cannot serve files from the repository-level extension folder during
  // development, while the packaged app needs the same URL shape after build.
  // This is intentionally a stale-aware mirror, not a theme/export generator:
  // extension manifests stay the source of truth and the copy only bridges
  // static SVG assets until Axon has a first-class extension asset protocol.
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  return true;
}

const manifests = extensionRoots.flatMap((rootPath) =>
  findExtensionDirectories(rootPath).map((extensionPath) =>
    validateManifest(extensionPath),
  ),
);
const mirroredCount = staticAssetMirrors.filter(({ source, target }) =>
  mirrorDirectoryIfStale(source, target),
).length;

console.log(
  `Prepared ${manifests.length} Axon extension manifests` +
    (mirroredCount > 0 ? ` and refreshed ${mirroredCount} asset mirror.` : "."),
);
