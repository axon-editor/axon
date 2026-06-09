import { app } from "electron";
import fs from "fs";
import path from "path";
import { type CustomFont } from "../../shared/settings";
import { getCustomFontsDirectory } from "../settings/paths";

function toAxonLocalUrl(filePath: string) {
  return `axon://local${encodeURI(filePath)}`;
}

function getFontFamilyFromPath(filePath: string) {
  const parsed = path.parse(filePath);
  return parsed.name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function importCustomFontFile(sourcePath: string): CustomFont {
  const allowedExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);
  const extension = path.extname(sourcePath).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error("Unsupported font file type.");
  }

  const fontsDirectory = getCustomFontsDirectory();
  fs.mkdirSync(fontsDirectory, { recursive: true });

  const family = getFontFamilyFromPath(sourcePath);
  const targetPath = path.join(
    fontsDirectory,
    `${family.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}${extension}`,
  );

  // Imported fonts are copied into app-owned storage instead of referencing
  // the user's original download path. That keeps Axon settings portable
  // across project workspaces and prevents a missing Downloads file from
  // breaking font loading weeks later.
  fs.copyFileSync(sourcePath, targetPath);

  return {
    family,
    path: targetPath,
    url: toAxonLocalUrl(targetPath),
  };
}

export function getAxonIconPath(isDev: boolean) {
  if (isDev) {
    // Vite now packages static renderer assets from editor/public so the app
    // icon, splash logo, and file-tree assets all come from the same source of
    // truth. I still keep the old renderer-local path as a fallback because
    // older working trees may have the image there while someone is moving
    // between release branches.
    const devIcon = path.join(app.getAppPath(), "public/axon.png");
    if (fs.existsSync(devIcon)) return devIcon;

    const legacyDevIcon = path.join(
      app.getAppPath(),
      "src/renderer/public/axon.png",
    );
    if (fs.existsSync(legacyDevIcon)) return legacyDevIcon;
  }

  const builtIcon = path.join(__dirname, "../../renderer/axon.png");
  if (fs.existsSync(builtIcon)) return builtIcon;

  return path.join(app.getAppPath(), "public/axon.png");
}
