export type GitLineDecorationKind = "added" | "modified" | "deleted";

export interface GitLineDecoration {
  lineNumber: number;
  kind: GitLineDecorationKind;
}

interface PendingDiffChunk {
  addedLines: number[];
  deletedCount: number;
  deleteAnchor: number | null;
}

function clampLine(lineNumber: number, modelLineCount: number) {
  return Math.min(Math.max(1, lineNumber), Math.max(1, modelLineCount));
}

function parseHunkStart(line: string) {
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!match) return null;
  return Number(match[1]);
}

function setLineDecoration(
  decorations: Map<number, GitLineDecorationKind>,
  lineNumber: number,
  kind: GitLineDecorationKind,
) {
  const current = decorations.get(lineNumber);
  if (current === "deleted") return;
  if (current === "modified" && kind === "added") return;
  decorations.set(lineNumber, kind);
}

export function parseGitDiffLineDecorations(
  diff: string,
  modelLineCount: number,
): GitLineDecoration[] {
  const decorations = new Map<number, GitLineDecorationKind>();
  let newLineNumber: number | null = null;
  let chunk: PendingDiffChunk = {
    addedLines: [],
    deletedCount: 0,
    deleteAnchor: null,
  };

  const flushChunk = () => {
    if (newLineNumber === null) return;

    if (chunk.deletedCount > 0 && chunk.addedLines.length > 0) {
      for (const lineNumber of chunk.addedLines) {
        setLineDecoration(decorations, lineNumber, "modified");
      }
    } else if (chunk.addedLines.length > 0) {
      for (const lineNumber of chunk.addedLines) {
        setLineDecoration(decorations, lineNumber, "added");
      }
    } else if (chunk.deletedCount > 0) {
      setLineDecoration(
        decorations,
        clampLine(chunk.deleteAnchor ?? newLineNumber, modelLineCount),
        "deleted",
      );
    }

    chunk = {
      addedLines: [],
      deletedCount: 0,
      deleteAnchor: null,
    };
  };

  for (const line of diff.split(/\r?\n/)) {
    const hunkStart = parseHunkStart(line);
    if (hunkStart !== null) {
      flushChunk();
      newLineNumber = hunkStart;
      continue;
    }

    if (newLineNumber === null) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      chunk.addedLines.push(clampLine(newLineNumber, modelLineCount));
      newLineNumber++;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      chunk.deletedCount++;
      chunk.deleteAnchor ??= clampLine(newLineNumber, modelLineCount);
      continue;
    }

    if (line.startsWith(" ")) {
      flushChunk();
      newLineNumber++;
      continue;
    }

    flushChunk();
  }

  flushChunk();

  return [...decorations.entries()].map(([lineNumber, kind]) => ({
    lineNumber,
    kind,
  }));
}
