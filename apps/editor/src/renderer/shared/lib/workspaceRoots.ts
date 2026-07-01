export interface WorkspaceRoot {
  id: string;
  path: string;
  name: string;
  trusted: boolean | null;
}

export function getWorkspaceRootName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "workspace";
}

export function createWorkspaceRoot(
  path: string,
  trusted: boolean | null = null,
): WorkspaceRoot {
  return {
    id: path,
    path,
    name: getWorkspaceRootName(path),
    trusted,
  };
}

export function upsertWorkspaceRoot(
  roots: WorkspaceRoot[],
  path: string,
  trusted: boolean | null = null,
) {
  const existing = roots.find((root) => root.path === path);
  if (existing) {
    return roots.map((root) =>
      root.path === path
        ? {
            ...root,
            name: getWorkspaceRootName(path),
            trusted,
          }
        : root,
    );
  }

  return [...roots, createWorkspaceRoot(path, trusted)];
}

export function normalizeWorkspaceRoots(value: unknown): WorkspaceRoot[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const roots: WorkspaceRoot[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      id?: unknown;
      path?: unknown;
      name?: unknown;
      trusted?: unknown;
    };
    if (typeof candidate.path !== "string" || seen.has(candidate.path)) {
      continue;
    }

    seen.add(candidate.path);
    roots.push({
      id:
        typeof candidate.id === "string" && candidate.id.length > 0
          ? candidate.id
          : candidate.path,
      path: candidate.path,
      name:
        typeof candidate.name === "string" && candidate.name.length > 0
          ? candidate.name
          : getWorkspaceRootName(candidate.path),
      trusted:
        typeof candidate.trusted === "boolean" ? candidate.trusted : null,
    });
  }

  return roots;
}
