import { app } from "electron";
import fs from "fs";
import path from "path";

export function getBundledAppFilePath(...segments: string[]) {
  const packagedPath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    ...segments,
  );
  if (app.isPackaged && fs.existsSync(packagedPath)) return packagedPath;

  return path.join(app.getAppPath(), ...segments);
}

export function resolveBundledAppFilePath(...segments: string[]) {
  const candidate = getBundledAppFilePath(...segments);
  return fs.existsSync(candidate) ? candidate : "";
}
