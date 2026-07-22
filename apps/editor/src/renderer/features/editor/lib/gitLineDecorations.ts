export type GitLineDecorationKind = "added" | "modified" | "deleted";

export interface GitLineDecoration {
  lineNumber: number;
  kind: GitLineDecorationKind;
}

type LineEditKind = "equal" | "added" | "deleted";

const MAX_EDIT_DISTANCE = 512;

function splitLines(content: string) {
  if (content.length === 0) return [];
  return content.replace(/\r\n/g, "\n").split("\n");
}

function backtrackLineEdits(
  trace: Map<number, number>[],
  originalLength: number,
  modifiedLength: number,
) {
  const edits: LineEditKind[] = [];
  let originalIndex = originalLength;
  let modifiedIndex = modifiedLength;

  for (let distance = trace.length - 1; distance >= 0; distance -= 1) {
    const diagonal = originalIndex - modifiedIndex;
    const frontier = trace[distance];
    const previousDiagonal =
      diagonal === -distance ||
      (diagonal !== distance &&
        (frontier.get(diagonal - 1) ?? -1) <
          (frontier.get(diagonal + 1) ?? -1))
        ? diagonal + 1
        : diagonal - 1;
    const previousOriginalIndex = frontier.get(previousDiagonal) ?? 0;
    const previousModifiedIndex = previousOriginalIndex - previousDiagonal;

    while (
      originalIndex > previousOriginalIndex &&
      modifiedIndex > previousModifiedIndex
    ) {
      edits.push("equal");
      originalIndex -= 1;
      modifiedIndex -= 1;
    }

    if (distance === 0) break;
    if (originalIndex === previousOriginalIndex) {
      edits.push("added");
      modifiedIndex -= 1;
    } else {
      edits.push("deleted");
      originalIndex -= 1;
    }
  }

  return edits.reverse();
}

function computeLineEdits(original: string[], modified: string[]) {
  const frontier = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  const maximumDistance = Math.min(
    original.length + modified.length,
    MAX_EDIT_DISTANCE,
  );

  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    trace.push(new Map(frontier));

    for (
      let diagonal = -distance;
      diagonal <= distance;
      diagonal += 2
    ) {
      const moveDown =
        diagonal === -distance ||
        (diagonal !== distance &&
          (frontier.get(diagonal - 1) ?? -1) <
            (frontier.get(diagonal + 1) ?? -1));
      let originalIndex = moveDown
        ? (frontier.get(diagonal + 1) ?? 0)
        : (frontier.get(diagonal - 1) ?? 0) + 1;
      let modifiedIndex = originalIndex - diagonal;

      while (
        originalIndex < original.length &&
        modifiedIndex < modified.length &&
        original[originalIndex] === modified[modifiedIndex]
      ) {
        originalIndex += 1;
        modifiedIndex += 1;
      }

      frontier.set(diagonal, originalIndex);
      if (
        originalIndex >= original.length &&
        modifiedIndex >= modified.length
      ) {
        return backtrackLineEdits(trace, original.length, modified.length);
      }
    }
  }

  return null;
}

function clampLine(lineNumber: number, lineCount: number) {
  return Math.min(Math.max(1, lineNumber), Math.max(1, lineCount));
}

function coarseDecorations(
  originalLength: number,
  modifiedLength: number,
  startLine: number,
  modelLineCount: number,
) {
  if (modifiedLength === 0) {
    return [
      {
        lineNumber: clampLine(startLine, modelLineCount),
        kind: "deleted" as const,
      },
    ];
  }

  const kind: GitLineDecorationKind =
    originalLength === 0 ? "added" : "modified";
  return Array.from({ length: modifiedLength }, (_, index) => ({
    lineNumber: clampLine(startLine + index, modelLineCount),
    kind,
  }));
}

export function computeGitLineDecorations(
  baseContent: string,
  currentContent: string,
): GitLineDecoration[] {
  const original = splitLines(baseContent);
  const modified = splitLines(currentContent);
  let prefixLength = 0;

  while (
    prefixLength < original.length &&
    prefixLength < modified.length &&
    original[prefixLength] === modified[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < original.length - prefixLength &&
    suffixLength < modified.length - prefixLength &&
    original[original.length - suffixLength - 1] ===
      modified[modified.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const originalMiddle = original.slice(
    prefixLength,
    original.length - suffixLength,
  );
  const modifiedMiddle = modified.slice(
    prefixLength,
    modified.length - suffixLength,
  );
  if (originalMiddle.length === 0 && modifiedMiddle.length === 0) return [];

  const startLine = prefixLength + 1;
  const edits = computeLineEdits(originalMiddle, modifiedMiddle);
  if (!edits) {
    return coarseDecorations(
      originalMiddle.length,
      modifiedMiddle.length,
      startLine,
      modified.length,
    );
  }

  const decorations: GitLineDecoration[] = [];
  let currentLine = startLine;
  let addedLines: number[] = [];
  let deletedCount = 0;

  const flush = () => {
    if (addedLines.length > 0) {
      const kind: GitLineDecorationKind =
        deletedCount > 0 ? "modified" : "added";
      decorations.push(
        ...addedLines.map((lineNumber) => ({ lineNumber, kind })),
      );
    } else if (deletedCount > 0) {
      decorations.push({
        lineNumber: clampLine(currentLine, modified.length),
        kind: "deleted",
      });
    }
    addedLines = [];
    deletedCount = 0;
  };

  for (const edit of edits) {
    if (edit === "equal") {
      flush();
      currentLine += 1;
    } else if (edit === "added") {
      addedLines.push(clampLine(currentLine, modified.length));
      currentLine += 1;
    } else {
      deletedCount += 1;
    }
  }
  flush();

  return decorations;
}
