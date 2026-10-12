/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as monaco from "monaco-editor";
import { type GitLineDecoration } from "./gitLineDecorations";

export interface GitLinePaintColors {
  added: string;
  modified: string;
  deleted: string;
}

interface GitLinePaintOptions {
  // A diff's modified pane has no line for a pure deletion, so a deleted
  // decoration would clamp onto the next surviving line and read as if that
  // unchanged line was removed. The editor still wants the marker to show
  // where a deletion happened, so this stays on by default and the diff opts
  // out.
  includeDeleted?: boolean;
}

// The editor and the Git diff surfaces have to render a change the same way, so
// the whole-line wash, gutter bar, glyph, and overview-ruler tick all come from
// one builder. Keeping the class names here means the CSS in App.css only has to
// agree with a single source, and a diff pane stops inventing its own line tint
// on top of Monaco's own add/remove background.
export function buildGitLineDecorations(
  decorations: GitLineDecoration[],
  gitColors: GitLinePaintColors,
  { includeDeleted = true }: GitLinePaintOptions = {},
): monaco.editor.IModelDeltaDecoration[] {
  return decorations
    .filter((decoration) => includeDeleted || decoration.kind !== "deleted")
    .map((decoration) => ({
      range: new monaco.Range(
        decoration.lineNumber,
        1,
        decoration.lineNumber,
        1,
      ),
      options: {
        isWholeLine: true,
        className: `axon-git-line axon-git-line--${decoration.kind}`,
        linesDecorationsClassName: `axon-git-gutter axon-git-gutter--${decoration.kind}`,
        glyphMarginClassName: `axon-git-glyph axon-git-glyph--${decoration.kind}`,
        overviewRuler: {
          color: gitColors[decoration.kind],
          position: monaco.editor.OverviewRulerLane.Left,
        },
      },
    }));
}
