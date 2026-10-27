/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { KeyboardEvent } from "react";
import CommandModal from "@axon-editor/renderer/shared/components/modals/CommandModal";
import ModalSearchInput from "@axon-editor/renderer/shared/components/modals/search/ModalSearchInput";
import type { FileNode } from "@axon-editor/renderer/shared/lib/backend/api";
import type { GitChange } from "@axon-editor/shared/workspace/git";
import ZenTreeFooter from "./overlay/footer/ZenTreeFooter";
import ZenTreeHeader from "./overlay/header/ZenTreeHeader";
import ZenTreeSearchResults from "./search/results/ZenTreeSearchResults";
import { useZenFileSearch } from "./search/state/useZenFileSearch";
import {
  ZEN_TREE_MODAL_WIDTH,
  ZEN_TREE_PANEL_SHADOW,
} from "./shared/zenTreeConstants";
import ZenTreeList from "./tree/list/ZenTreeList";
import { useZenWorkspaceTree } from "./tree/state/useZenWorkspaceTree";

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  gitChanges: GitChange[];
  ignoredPaths: string[];
  loading: boolean;
  onClose: () => void;
  onFileSelect: (path: string) => void;
}

export default function ZenWorkspaceTreeModal({
  tree,
  folderPath,
  activeFile,
  gitChanges,
  ignoredPaths,
  loading,
  onClose,
  onFileSelect,
}: Props) {
  const workspaceTree = useZenWorkspaceTree({
    tree,
    folderPath,
    activeFile,
    gitChanges,
    ignoredPaths,
    onFileSelect,
    onClose,
  });
  const search = useZenFileSearch({ folderPath, onFileSelect, onClose });

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (search.searching) {
      search.handleKeyDown(event);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      workspaceTree.focusList();
      workspaceTree.setSelectedIndex(
        event.key === "ArrowDown"
          ? 0
          : Math.max(0, workspaceTree.rows.length - 1),
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      workspaceTree.openSelected();
    }
  };

  const status = !workspaceTree.rootPath
    ? "Open a folder to browse files"
    : search.searching
      ? search.loading
        ? "Indexing project files..."
        : `Search across ${search.projectFileCount.toLocaleString()} indexed files`
      : "Read-only workspace tree";

  return (
    <CommandModal
      title="Workspace tree"
      width={ZEN_TREE_MODAL_WIDTH}
      bodyClassName="axon-zen-tree-surface flex min-h-0 flex-1 flex-col overflow-hidden"
      overlayClassName="backdrop-blur-[2px] backdrop-brightness-75"
      panelStyle={{ boxShadow: ZEN_TREE_PANEL_SHADOW }}
      resizable="zen-workspace-tree"
      header={(close) => (
        <ZenTreeHeader
          rootPath={workspaceTree.rootPath}
          fileCount={search.projectFileCount}
          gitChangeCount={gitChanges.length}
          onClose={close}
        />
      )}
      onClose={onClose}
    >
      <ModalSearchInput
        value={search.query}
        onChange={search.setQuery}
        onKeyDown={handleSearchKeyDown}
        placeholder="Search files by name or path..."
        autoFocus
        ariaLabel="Search workspace files"
        ariaControls={
          search.searching ? "zen-tree-search-results" : undefined
        }
        ariaActiveDescendant={
          search.searching && search.results.length > 0
            ? `zen-search-row-${search.activeIndex}`
            : undefined
        }
        trailing={
          search.loading && (
            <span className="shrink-0 rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
              indexing
            </span>
          )
        }
      />

      {search.searching ? (
        <ZenTreeSearchResults
          results={search.results}
          activeIndex={search.activeIndex}
          query={search.query}
          loading={search.loading}
          error={search.error}
          gitDecorations={workspaceTree.gitDecorations}
          ignoredPathSet={workspaceTree.ignoredPathSet}
          listRef={search.listRef}
          onSelect={search.selectResult}
        />
      ) : (
        <ZenTreeList
          rows={workspaceTree.rows}
          activeIndex={workspaceTree.activeIndex}
          expandedPaths={workspaceTree.expandedPaths}
          loadingPaths={workspaceTree.loadingPaths}
          gitDecorations={workspaceTree.gitDecorations}
          ignoredPathSet={workspaceTree.ignoredPathSet}
          loading={loading}
          hasTree={Boolean(tree)}
          listRef={workspaceTree.listRef}
          onKeyDown={workspaceTree.handleKeyDown}
          onRowSelect={workspaceTree.handleRowClick}
        />
      )}

      <ZenTreeFooter searching={search.searching} status={status} />
    </CommandModal>
  );
}
