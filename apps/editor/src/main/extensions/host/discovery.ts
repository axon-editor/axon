import fs from "fs";
import path from "path";
import { EXTENSION_MANIFEST_FILE } from "../paths";

export function findExtensionDirectories(rootPath: string | null) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];

  const extensionDirectories: string[] = [];
  const visit = (currentPath: string) => {
    const manifestPath = path.join(currentPath, EXTENSION_MANIFEST_FILE);
    if (fs.existsSync(manifestPath)) {
      extensionDirectories.push(currentPath);
      return;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      visit(path.join(currentPath, entry.name));
    }
  };

  // Built-ins now live under grouped roots like extensions/builtin/themes/*
  // and extensions/builtin/icons/*. Recursing until the first manifest keeps
  // that structure working while preventing a nested package from being claimed
  // as part of its parent extension after a real manifest has been found.
  visit(rootPath);
  return extensionDirectories;
}
