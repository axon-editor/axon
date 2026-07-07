import fs from "fs";
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

export function listProjectFiles(rootPath: string, limit = 20000): ProjectFileEntry[] {
  const root = path.resolve(rootPath);
  const files: ProjectFileEntry[] = [];
  const pending = [root];

  while (pending.length > 0 && files.length < limit) {
    const directory = pending.pop();
    if (!directory || shouldSkipProjectFilePath(directory)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        if (files.length >= limit) return;
        const absolutePath = path.join(directory, entry.name);
        if (shouldSkipProjectFilePath(absolutePath)) return;
        if (entry.isDirectory()) {
          pending.push(absolutePath);
          return;
        }
        if (!entry.isFile()) return;
        files.push({
          name: entry.name,
          path: absolutePath,
          is_dir: false,
        });
      });
  }

  return files;
}
