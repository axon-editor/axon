function normalizePathSegments(pathValue: string) {
  const segments: string[] = [];
  for (const segment of pathValue.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function isAbsoluteProposalPath(pathValue: string) {
  return pathValue.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathValue);
}

export function resolveProposalPath(proposalPath: string, folderPath: string) {
  const workspace = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedProposal = proposalPath.replace(/\\/g, "/");
  let relative = normalizedProposal;

  if (isAbsoluteProposalPath(normalizedProposal)) {
    if (
      normalizedProposal !== workspace &&
      !normalizedProposal.startsWith(`${workspace}/`)
    ) {
      return null;
    }
    relative = normalizedProposal.slice(workspace.length).replace(/^\/+/, "");
  }

  const safeRelative = normalizePathSegments(relative);
  if (safeRelative === null) return null;
  return safeRelative ? `${workspace}/${safeRelative}` : workspace;
}
