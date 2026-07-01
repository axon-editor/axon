import fs from "node:fs";
import path from "node:path";

const editorRoot = process.cwd();
const workspaceRoot = path.resolve(editorRoot, "..", "..");
const iconExtensionAssets = path.resolve(
  workspaceRoot,
  "extensions/builtin/icons/catppuccin/assets",
);
const publicIconTarget = path.resolve(editorRoot, "public/icons");
const publicCatppuccinIconTarget = path.resolve(
  editorRoot,
  "public/extensions/builtin/icons/catppuccin/assets",
);

function copyDirectory(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`missing bundled asset source: ${sourcePath}`);
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

// Renderer code still loads file-tree icons through Vite's public directory.
// The extension package is now the source of truth, but copying the assets into
// public before dev/build keeps packaged and development renderer URLs stable
// while the extension host grows into a real asset protocol later. The legacy
// public/icons copy remains for older call sites and packaged builds that may
// still reference the old flat path during the migration window.
copyDirectory(iconExtensionAssets, publicIconTarget);
copyDirectory(iconExtensionAssets, publicCatppuccinIconTarget);
