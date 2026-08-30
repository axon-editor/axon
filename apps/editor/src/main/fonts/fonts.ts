import { app } from "electron";
import fs from "fs";
import path from "path";
import { type CustomFont } from "../../shared/settings";
import { getCustomFontsDirectory } from "../settings/paths";

function getFontFamilyFromPath(filePath: string) {
  const parsed = path.parse(filePath);
  return parsed.name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getFontWeightFromName(name: string) {
  if (name.includes("ExtraLight")) return 200;
  if (name.includes("Light")) return 300;
  if (name.includes("Medium")) return 500;
  if (name.includes("SemiBold")) return 600;
  if (name.includes("ExtraBold")) return 800;
  if (name.includes("Bold")) return 700;
  return 400;
}

function getFontStretchFromName(name: string) {
  if (name.includes("SemiWide")) return "semi-expanded";
  if (name.includes("Wide")) return "expanded";
  return undefined;
}

function getFontMetadataFromPath(filePath: string): CustomFont {
  const parsed = path.parse(filePath);
  const name = parsed.name;
  const monaspaceMatch = name.match(/^Monaspace([A-Za-z]+)NF-/);

  if (!monaspaceMatch) {
    return {
      family: getFontFamilyFromPath(filePath),
      path: filePath,
      url: "",
    };
  }

  const family = `Monaspace ${monaspaceMatch[1]} NF`;
  return {
    family,
    path: filePath,
    url: "",
    weight: getFontWeightFromName(name),
    style: name.includes("Italic") ? "italic" : "normal",
    stretch: getFontStretchFromName(name),
  };
}

function isFontFile(filePath: string) {
  return [".ttf", ".otf", ".woff", ".woff2"].includes(
    path.extname(filePath).toLowerCase(),
  );
}

function collectFontFiles(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) return [];

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) return collectFontFiles(entryPath);
    return entry.isFile() && isFontFile(entryPath) ? [entryPath] : [];
  });
}

export function importCustomFontFile(sourcePath: string): CustomFont {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!isFontFile(sourcePath)) {
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
    url: "",
  };
}

export function listAvailableLocalFonts(): CustomFont[] {
  const candidateRoots = [
    path.resolve(app.getAppPath(), "..", "..", "NerdFonts"),
    path.resolve(process.resourcesPath, "NerdFonts"),
  ];
  return candidateRoots
    .flatMap(collectFontFiles)
    .sort((a, b) => a.localeCompare(b))
    .map(getFontMetadataFromPath);
}

export function getAxonIconPath(isDev: boolean) {
  if (isDev) {
    // The square application artwork and the transparent in-app Axon mark have
    // different jobs. The Dock needs the square icon so macOS does not replace
    // the bundle artwork with the older renderer logo when a dev window opens.
    const devIcon = path.join(app.getAppPath(), "build/axon.png");
    if (fs.existsSync(devIcon)) return devIcon;
  } else if (process.platform === "darwin") {
    // electron-builder generates this native icon from build/axon.png. Using
    // the packaged resource for About keeps it identical to the Finder and Dock
    // artwork instead of resolving dist/renderer/axon.png, which is deliberately
    // the transparent logo used inside the workbench.
    const packagedIcon = path.join(process.resourcesPath, "icon.icns");
    if (fs.existsSync(packagedIcon)) return packagedIcon;
  }

  const builtIcon = path.join(__dirname, "../../renderer/axon.png");
  if (fs.existsSync(builtIcon)) return builtIcon;

  return path.join(app.getAppPath(), "public/axon.png");
}
