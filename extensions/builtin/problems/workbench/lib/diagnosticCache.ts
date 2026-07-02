import { type EditorDiagnostic } from "./diagnostics";

export const MAX_PROJECT_DIAGNOSTICS = 1_000;
export const MAX_LSP_DIAGNOSTIC_FILES = 500;
export const MAX_LSP_DIAGNOSTICS_PER_FILE = 100;

export type LspDiagnosticsByFile = Record<string, EditorDiagnostic[]>;

export function capDiagnostics(
  diagnostics: EditorDiagnostic[],
  maxDiagnostics: number,
) {
  return diagnostics.length > maxDiagnostics
    ? diagnostics.slice(0, maxDiagnostics)
    : diagnostics;
}

export function updateLspDiagnosticCache(
  current: LspDiagnosticsByFile,
  filePath: string,
  serverId: string,
  diagnostics: EditorDiagnostic[],
) {
  const next = { ...current };
  const cacheKey = `${serverId}\u0000${filePath}`;

  // Language servers can publish workspace-wide diagnostics for very large
  // projects. Keeping every file forever makes the renderer memory footprint
  // depend on the noisiest server instead of the files the user is actively
  // working with, so I bound both dimensions of this cache. The key includes
  // the server id because TSX/HTML/CSS files can be owned by both the primary
  // language server and Tailwind; replacing by file path alone lets whichever
  // server publishes last erase the other server's diagnostics.
  if (diagnostics.length === 0) {
    delete next[cacheKey];
  } else {
    next[cacheKey] = capDiagnostics(diagnostics, MAX_LSP_DIAGNOSTICS_PER_FILE);
  }

  const entries = Object.entries(next);
  if (entries.length <= MAX_LSP_DIAGNOSTIC_FILES) return next;

  return Object.fromEntries(entries.slice(-MAX_LSP_DIAGNOSTIC_FILES));
}

export function isDiagnosticInWorkspace(
  diagnostic: EditorDiagnostic,
  workspacePath: string | null,
) {
  if (!workspacePath) return false;

  const normalizedWorkspacePath = workspacePath.replace(/\\/g, "/");
  const normalizedDiagnosticPath = diagnostic.path.replace(/\\/g, "/");
  return (
    normalizedDiagnosticPath === normalizedWorkspacePath ||
    normalizedDiagnosticPath.startsWith(`${normalizedWorkspacePath}/`)
  );
}
