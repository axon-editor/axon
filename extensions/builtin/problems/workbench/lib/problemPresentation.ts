import { type EditorDiagnostic } from "./diagnostics";

export type ProblemSeverityFilter = EditorDiagnostic["severity"] | "all";
export type ProblemScopeFilter = "workspace" | "current-file";

export interface ProblemFileGroup {
  path: string;
  diagnostics: EditorDiagnostic[];
}

export const severityStyles: Record<EditorDiagnostic["severity"], string> = {
  error: "text-[#ea6c73]",
  warning: "text-[#ffcc66]",
  info: "text-[#80c8e0]",
  hint: "text-[#647086]",
};

export const severityLabels: Record<EditorDiagnostic["severity"], string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
  hint: "Hints",
};

export const severityIcons: Record<EditorDiagnostic["severity"], string> = {
  error: "bg-[#ea6c73]",
  warning: "bg-[#ffcc66]",
  info: "bg-[#80c8e0]",
  hint: "bg-[#647086]",
};

export function getFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getParentPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const fileName = getFileName(normalizedPath);
  return normalizedPath.slice(
    0,
    Math.max(0, normalizedPath.length - fileName.length - 1),
  );
}

export function normalizeProblemPath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "");
}

export function formatDiagnosticForCopy(diagnostic: EditorDiagnostic) {
  const source = diagnostic.source ? ` source=${diagnostic.source}` : "";
  const code =
    diagnostic.code === undefined ? "" : ` code=${String(diagnostic.code)}`;

  return [
    `${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`,
    `[${diagnostic.severity}${source}${code}]`,
    diagnostic.message,
  ].join(" ");
}

export function formatDiagnosticsForCopy(diagnostics: EditorDiagnostic[]) {
  return diagnostics.map(formatDiagnosticForCopy).join("\n");
}

export function countDiagnosticsBySeverity(diagnostics: EditorDiagnostic[]) {
  return diagnostics.reduce(
    (nextCounts, diagnostic) => {
      nextCounts[diagnostic.severity] += 1;
      return nextCounts;
    },
    { error: 0, warning: 0, info: 0, hint: 0 },
  );
}

export function filterDiagnostics({
  activeFile,
  diagnostics,
  query,
  scope,
  severity,
}: {
  activeFile: string | null;
  diagnostics: EditorDiagnostic[];
  query: string;
  scope: ProblemScopeFilter;
  severity: ProblemSeverityFilter;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedActiveFile = activeFile
    ? normalizeProblemPath(activeFile)
    : null;

  return diagnostics.filter((diagnostic) => {
    if (severity !== "all" && diagnostic.severity !== severity) {
      return false;
    }

    if (
      scope === "current-file" &&
      normalizeProblemPath(diagnostic.path) !== normalizedActiveFile
    ) {
      return false;
    }

    if (!normalizedQuery) return true;
    return [
      diagnostic.path,
      getFileName(diagnostic.path),
      diagnostic.message,
      diagnostic.source ?? "",
      diagnostic.code === undefined ? "" : String(diagnostic.code),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function groupDiagnosticsByFile(
  diagnostics: EditorDiagnostic[],
): ProblemFileGroup[] {
  const groups = new Map<string, EditorDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const existingDiagnostics = groups.get(diagnostic.path) ?? [];
    existingDiagnostics.push(diagnostic);
    groups.set(diagnostic.path, existingDiagnostics);
  }

  return Array.from(groups.entries())
    .map(([path, fileDiagnostics]) => ({
      path,
      diagnostics: fileDiagnostics.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      }),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
