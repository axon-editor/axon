/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { buildGitLineDecorations } from "./gitLinePaint";
import { computeGitLineDecorations } from "./gitLineDecorations";

const gitColors = {
  added: "#56d38b",
  modified: "#e5b95c",
  deleted: "#ff7b72",
};

describe("git line paint", () => {
  it("maps each change onto the shared Axon decoration classes", () => {
    const decorations = buildGitLineDecorations(
      [
        { lineNumber: 4, kind: "added" },
        { lineNumber: 9, kind: "modified" },
        { lineNumber: 12, kind: "deleted" },
      ],
      gitColors,
    );

    expect(
      decorations.map((decoration) => ({
        line: decoration.range.startLineNumber,
        className: decoration.options.className,
        gutter: decoration.options.linesDecorationsClassName,
        glyph: decoration.options.glyphMarginClassName,
        ruler: decoration.options.overviewRuler?.color,
      })),
    ).toEqual([
      {
        line: 4,
        className: "axon-git-line axon-git-line--added",
        gutter: "axon-git-gutter axon-git-gutter--added",
        glyph: "axon-git-glyph axon-git-glyph--added",
        ruler: gitColors.added,
      },
      {
        line: 9,
        className: "axon-git-line axon-git-line--modified",
        gutter: "axon-git-gutter axon-git-gutter--modified",
        glyph: "axon-git-glyph axon-git-glyph--modified",
        ruler: gitColors.modified,
      },
      {
        line: 12,
        className: "axon-git-line axon-git-line--deleted",
        gutter: "axon-git-gutter axon-git-gutter--deleted",
        glyph: "axon-git-glyph axon-git-glyph--deleted",
        ruler: gitColors.deleted,
      },
    ]);
  });

  it("paints whole-line but leaves inserted-line paint to Axon", () => {
    const [decoration] = buildGitLineDecorations(
      [{ lineNumber: 1, kind: "added" }],
      gitColors,
    );

    expect(decoration.options.isWholeLine).toBe(true);
  });

  it("returns no paint when the base matches the current buffer", () => {
    expect(buildGitLineDecorations([], gitColors)).toEqual([]);
  });

  it("keeps a deleted property off the modified pane so the next unchanged line stays clean", () => {
    const base =
      '{\n  folder: "zed",\n  id: "axon.zed-theme",\n  name: "Zed Theme",\n}';
    const modified = '{\n  folder: "zed",\n  name: "Zed Theme",\n}';

    // The editor anchors the deletion to the surviving line 3, which is the
    // unchanged name property here. That is the whole point of the editor
    // marker, but painting it on the diff pane would blame the wrong line.
    expect(computeGitLineDecorations(base, modified)).toEqual([
      { lineNumber: 3, kind: "deleted" },
    ]);
    expect(
      buildGitLineDecorations(
        computeGitLineDecorations(base, modified),
        gitColors,
        { includeDeleted: false },
      ),
    ).toEqual([]);
  });
});
