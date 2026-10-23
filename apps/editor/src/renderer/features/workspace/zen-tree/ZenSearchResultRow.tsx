/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ZenEntryIcon from "./ZenEntryIcon";
import { GIT_TONE_COLORS, IGNORED_ENTRY_COLOR } from "./zenTreeGit";
import { normalizeTreePath } from "./zenTreePath";
import type { GitTone, ZenSearchResult } from "./types";

interface Props {
  result: ZenSearchResult;
  index: number;
  active: boolean;
  tone?: GitTone;
  ignored: boolean;
  onSelect: (index: number) => void;
}

export default function ZenSearchResultRow({
  result,
  index,
  active,
  tone,
  ignored,
  onSelect,
}: Props) {
  const entryColor = tone
    ? GIT_TONE_COLORS[tone]
    : ignored
      ? IGNORED_ENTRY_COLOR
      : undefined;
  const parentPath = normalizeTreePath(result.file.path)
    .split("/")
    .slice(0, -1)
    .join("/");

  return (
    <div
      id={`zen-search-row-${index}`}
      role="option"
      aria-selected={active}
      data-zen-search-index={index}
      onClick={() => onSelect(index)}
      onMouseDown={(event) => event.preventDefault()}
      className={`flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 transition-colors ${
        active
          ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
          : ignored
            ? "text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-80"
            : "text-[var(--axon-editor-foreground)] opacity-72 hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
      }`}
    >
      <ZenEntryIcon
        name={result.file.name}
        isDir={false}
        color={entryColor}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[12px]"
          style={{ color: entryColor }}
        >
          {result.file.name}
        </span>
        {parentPath && (
          <span className="block truncate text-[10px] opacity-40">
            {parentPath}
          </span>
        )}
      </span>
    </div>
  );
}
