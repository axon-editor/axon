/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChevronDown, ChevronRight } from "lucide-react";
import type { FileNode } from "@axon-editor/renderer/shared/lib/backend/api";
import ZenEntryIcon from "../../../entry/ZenEntryIcon";
import { TREE_BASE_INDENT, TREE_DEPTH_WIDTH } from "../../../shared/zenTreeConstants";
import { GIT_TONE_COLORS, IGNORED_ENTRY_COLOR } from "../../../shared/zenTreeGit";
import type { GitTone } from "../../../shared/types";

interface Props {
  node: FileNode;
  depth: number;
  index: number;
  active: boolean;
  expanded: boolean;
  loading: boolean;
  tone?: GitTone;
  ignored: boolean;
  onSelect: (index: number, node: FileNode) => void;
}

export default function ZenTreeRow({
  node,
  depth,
  index,
  active,
  expanded,
  loading,
  tone,
  ignored,
  onSelect,
}: Props) {
  const entryColor = tone
    ? GIT_TONE_COLORS[tone]
    : ignored
      ? IGNORED_ENTRY_COLOR
      : undefined;

  return (
    <div
      id={`zen-tree-row-${index}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={active}
      aria-expanded={node.is_dir ? expanded : undefined}
      data-zen-tree-index={index}
      onClick={() => onSelect(index, node)}
      onMouseDown={(event) => event.preventDefault()}
      className={`relative flex min-w-full cursor-pointer select-none items-center gap-1.5 whitespace-nowrap py-1 pr-3 text-[12px] transition-colors ${
        active
          ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
          : ignored
            ? "text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-80"
            : "text-[var(--axon-editor-foreground)] opacity-72 hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
      }`}
      style={{
        paddingLeft: `${TREE_BASE_INDENT + depth * TREE_DEPTH_WIDTH}px`,
      }}
    >
      <span className="flex h-4 w-3 shrink-0 items-center justify-center opacity-30">
        {node.is_dir &&
          (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
      </span>
      <ZenEntryIcon
        name={node.name}
        isDir={node.is_dir}
        expanded={expanded}
        color={entryColor}
      />
      <span className="min-w-0 truncate" style={{ color: entryColor }}>
        {node.name}
      </span>
      {loading && (
        <span className="ml-auto pl-3 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
          loading
        </span>
      )}
    </div>
  );
}
