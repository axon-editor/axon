import fs from "fs";
import path from "path";

export function canonicalWorkspacePath(value: string) {
  const absolutePath = path.resolve(value);
  let existingAncestor = absolutePath;
  const missingSegments: string[] = [];

  // A file being created has no realpath yet. Resolving its nearest existing
  // ancestor closes the important symlink case where `workspace/link/new.txt`
  // looks lexically contained but `link` actually points outside the approved
  // root. The missing suffix is appended only after the ancestor is canonical.
  while (true) {
    try {
      const canonicalAncestor = fs.realpathSync(existingAncestor);
      return path.join(canonicalAncestor, ...missingSegments.reverse());
    } catch {
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) return absolutePath;
      missingSegments.push(path.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}

export function pathInsideWorkspaceRoot(
  candidatePath: string,
  rootPath: string,
) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
