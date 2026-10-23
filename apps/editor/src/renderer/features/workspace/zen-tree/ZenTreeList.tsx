/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { KeyboardEvent, RefObject } from "react";
import { FolderOpen } from "lucide-react";
import type { FileNode } from "../../../shared/lib/backend/api";
import ModalEmptyState from "../../../shared/components/modals/empty/ModalEmptyState";
import ZenTreeRow from "./ZenTreeRow";
import { normalizeTreePath } from "./zenTreePath";
import type { TreeRow } from "./zenTreeRows";
import type { GitTone } from "./types";

interface Props {
  rows: TreeRow[];
  activeIndex: number;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  gitDecorations: Map<string, GitTone>;
  ignoredPathSet: Set<string>;
  loading: boolean;
  hasTree: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRowSelect: (index: number, node: FileNode) => void;
}

export default function ZenTreeList({
  rows,
  activeIndex,
  expandedPaths,
  loadingPaths,
  gitDecorations,
  ignoredPathSet,
  loading,
  hasTree,
  listRef,
  onKeyDown,
  onRowSelect,
}: Props) {
  return (
    <div
      ref={listRef}
      role="tree"
      tabIndex={0}
      aria-label="Workspace files"
      aria-activedescendant={
        rows.length > 0 ? `zen-tree-row-${activeIndex}` : undefined
      }
      onKeyDown={onKeyDown}
      className="max-h-[60vh] min-h-[8rem] overflow-auto py-1 outline-none"
    >
      {rows.length === 0 ? (
        <ModalEmptyState
          icon={FolderOpen}
          title={
            loading
              ? "Loading workspace"
              : hasTree
                ? "No files in this workspace"
                : "No workspace open"
          }
          description={
            loading
              ? "Reading the active folder."
              : hasTree
                ? "The active folder does not contain any files."
                : "Open a folder to browse its files."
          }
        />
      ) : (
        rows.map((row, index) => {
          const { node, depth } = row;
          const expanded = node.is_dir && expandedPaths.has(node.path);
          const isLoading = expanded && loadingPaths.has(node.path);
          const normalizedPath = normalizeTreePath(node.path);

          return (
            <ZenTreeRow
              key={node.path}
              node={node}
              depth={depth}
              index={index}
              active={index === activeIndex}
              expanded={expanded}
              loading={isLoading}
              tone={gitDecorations.get(normalizedPath)}
              ignored={ignoredPathSet.has(normalizedPath)}
              onSelect={onRowSelect}
            />
          );
        })
      )}
    </div>
  );
}
