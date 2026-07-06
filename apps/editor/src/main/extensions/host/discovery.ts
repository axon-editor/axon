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

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (err) {
      console.warn(
        `[extensions] skipped unreadable extension folder ${currentPath}:`,
        err instanceof Error ? err.message : err,
      );
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        visit(path.join(currentPath, entry.name));
      } catch (err) {
        console.warn(
          `[extensions] skipped broken extension folder ${path.join(
            currentPath,
            entry.name,
          )}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  };

  // Built-ins now live under grouped roots like extensions/builtin/themes/*
  // and extensions/builtin/icons/*. Recursing until the first manifest keeps
  // that structure working while preventing a nested package from being claimed
  // as part of its parent extension after a real manifest has been found.
  visit(rootPath);
  return extensionDirectories;
}
