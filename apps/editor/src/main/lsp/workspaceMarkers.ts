import fs from "fs";
import path from "path";

const WORKSPACE_MARKER_SEARCH_DEPTH = 4;
const WORKSPACE_MARKER_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".gocache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "__pycache__",
]);

function directoryHasFileWithExtension(
  folderPath: string,
  extension: string,
  depth = 0,
): boolean {
  if (depth > WORKSPACE_MARKER_SEARCH_DEPTH) return false;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension)) return true;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (WORKSPACE_MARKER_IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;

    // Workspace relevance is queried from Settings and the status bar, so this
    // scan must stay shallow and exclude generated dependency trees. Four
    // levels still finds normal monorepo layouts such as packages/api/src while
    // preventing one UI refresh from walking node_modules or build artifacts.
    if (
      directoryHasFileWithExtension(
        path.join(folderPath, entry.name),
        extension,
        depth + 1,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function hasWorkspaceMarker(folderPath: string, markers: string[]) {
  return markers.some((marker) => {
    if (!marker.includes("*")) {
      return fs.existsSync(path.join(folderPath, marker));
    }

    // Language definitions only use the predictable `*.ext` glob form here.
    // Keeping this intentionally small avoids introducing a second full glob
    // engine into startup and makes marker checks deterministic on every OS.
    const extension = marker.startsWith("*.") ? marker.slice(1) : "";
    if (!extension) return false;

    return directoryHasFileWithExtension(folderPath, extension);
  });
}
