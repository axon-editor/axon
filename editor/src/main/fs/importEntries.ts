import fs from "fs";
import path from "path";

export interface ImportedEntry {
  sourcePath: string;
  targetPath: string;
  isDir: boolean;
}

function ensureDirectoryPath(targetDir: string) {
  const resolvedTargetDir = path.resolve(targetDir);
  const stat = fs.statSync(resolvedTargetDir);
  if (!stat.isDirectory()) {
    throw new Error("Drop target is not a folder.");
  }

  return resolvedTargetDir;
}

function assertSafeImportTarget(sourcePath: string, targetDir: string) {
  const resolvedSourcePath = path.resolve(sourcePath);
  const resolvedTargetDir = path.resolve(targetDir);
  const sourceName = path.basename(resolvedSourcePath);
  const targetPath = path.join(resolvedTargetDir, sourceName);

  if (!sourceName) {
    throw new Error("Dropped entry does not have a valid name.");
  }

  if (!fs.existsSync(resolvedSourcePath)) {
    throw new Error(`${sourceName} no longer exists.`);
  }

  if (fs.existsSync(targetPath)) {
    throw new Error(`${sourceName} already exists in this folder.`);
  }

  const relativeTargetToSource = path.relative(resolvedSourcePath, resolvedTargetDir);
  if (
    relativeTargetToSource === "" ||
    (!relativeTargetToSource.startsWith("..") &&
      !path.isAbsolute(relativeTargetToSource))
  ) {
    throw new Error("Cannot drop a folder into itself.");
  }

  return {
    resolvedSourcePath,
    targetPath,
  };
}

export async function importExternalEntries(
  sourcePaths: string[],
  targetDir: string,
): Promise<ImportedEntry[]> {
  const resolvedTargetDir = ensureDirectoryPath(targetDir);
  const uniqueSourcePaths = Array.from(
    new Set(sourcePaths.map((sourcePath) => sourcePath.trim()).filter(Boolean)),
  );

  if (uniqueSourcePaths.length === 0) return [];

  const importedEntries: ImportedEntry[] = [];
  for (const sourcePath of uniqueSourcePaths) {
    const { resolvedSourcePath, targetPath } = assertSafeImportTarget(
      sourcePath,
      resolvedTargetDir,
    );
    const sourceStat = fs.statSync(resolvedSourcePath);

    // Finder/Explorer drops are imports, not moves. I copy with exclusive
    // creation so Axon never overwrites a project file because the user dropped
    // an external file with the same name onto the sidebar.
    if (sourceStat.isDirectory()) {
      await fs.promises.cp(resolvedSourcePath, targetPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
      });
    } else if (sourceStat.isFile()) {
      await fs.promises.copyFile(
        resolvedSourcePath,
        targetPath,
        fs.constants.COPYFILE_EXCL,
      );
    } else {
      throw new Error(`${path.basename(resolvedSourcePath)} is not a file or folder.`);
    }

    importedEntries.push({
      sourcePath: resolvedSourcePath,
      targetPath,
      isDir: sourceStat.isDirectory(),
    });
  }

  return importedEntries;
}
