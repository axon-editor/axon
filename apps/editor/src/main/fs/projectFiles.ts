import fs from "fs/promises";
import path from "path";

export interface ProjectFileEntry {
  name: string;
  path: string;
  is_dir: false;
}

const ignoredProjectFileSegments = new Set([
  ".git",
  ".ds_store",
  ".cache",
  ".build",
  ".dart_tool",
  ".expo",
  ".gradle",
  ".go-build",
  ".gocache",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".pytest_cache",
  ".ruff_cache",
  ".svelte-kit",
  ".tox",
  ".terraform",
  ".turbo",
  ".venv",
  ".vite",
  "__pycache__",
  "bin",
  "bower_components",
  "build",
  "carthage",
  "coverage",
  "node_modules",
  "debug",
  "deriveddata",
  "dist",
  "elm-stuff",
  "obj",
  "out",
  "pkg",
  "pods",
  "release",
  "release-builds",
  "target",
  "tmp",
  "vendor",
  "venv",
  "zig-cache",
]);

export function shouldSkipProjectFilePath(candidatePath: string) {
  const normalizedPath = candidatePath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments.some((segment) => {
    const normalizedSegment = segment.toLowerCase();
    if (ignoredProjectFileSegments.has(normalizedSegment)) return true;
    if (normalizedSegment.endsWith(".egg-info")) return true;
    if (normalizedSegment.startsWith("cmake-build-")) return true;
    return false;
  });
}

const DIRECTORY_READ_CONCURRENCY = 32;

export async function listProjectFiles(
  rootPath: string,
  limit = 20000,
): Promise<ProjectFileEntry[]> {
  const root = path.resolve(rootPath);
  const files: ProjectFileEntry[] = [];
  const pending = [root];

  while (pending.length > 0 && files.length < limit) {
    // Directory reads are asynchronous so workspace discovery yields the
    // Electron main thread back to window and IPC work. A fixed-size batch is
    // important here: fully parallelizing a 50,000-file tree can exhaust file
    // descriptors and performs worse on spinning disks and network volumes.
    const directories = pending.splice(-DIRECTORY_READ_CONCURRENCY);
    const directoryEntries = await Promise.all(
      directories.map(async (directory) => {
        if (shouldSkipProjectFilePath(directory)) return null;
        try {
          return {
            directory,
            entries: await fs.readdir(directory, { withFileTypes: true }),
          };
        } catch {
          return null;
        }
      }),
    );

    for (const result of directoryEntries) {
      if (!result) continue;
      const { directory, entries } = result;
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (files.length >= limit) break;
        const absolutePath = path.join(directory, entry.name);
        if (shouldSkipProjectFilePath(absolutePath)) continue;
        if (entry.isDirectory()) {
          pending.push(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        files.push({
          name: entry.name,
          path: absolutePath,
          is_dir: false,
        });
      }
    }
  }

  return files;
}
