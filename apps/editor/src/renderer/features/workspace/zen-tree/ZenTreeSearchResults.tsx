/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RefObject } from "react";
import { Search } from "lucide-react";
import ModalEmptyState from "../../../shared/components/modals/empty/ModalEmptyState";
import ZenSearchResultRow from "./ZenSearchResultRow";
import { normalizeTreePath } from "./zenTreePath";
import type { GitTone, ZenSearchResult } from "./types";

interface Props {
  results: ZenSearchResult[];
  activeIndex: number;
  query: string;
  loading: boolean;
  error: boolean;
  gitDecorations: Map<string, GitTone>;
  ignoredPathSet: Set<string>;
  listRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
}

export default function ZenTreeSearchResults({
  results,
  activeIndex,
  query,
  loading,
  error,
  gitDecorations,
  ignoredPathSet,
  listRef,
  onSelect,
}: Props) {
  if (error) {
    return (
      <ModalEmptyState
        icon={Search}
        title="Could not index project files"
        description="Close the tree and try again."
      />
    );
  }

  if (loading && results.length === 0) {
    return (
      <ModalEmptyState
        icon={Search}
        title="Indexing project files"
        description="Search will start as soon as the file list is ready."
      />
    );
  }

  if (results.length === 0) {
    return (
      <ModalEmptyState
        icon={Search}
        title={`No files match "${query}"`}
        description="Try a shorter name or part of the path."
      />
    );
  }

  return (
    <div
      ref={listRef}
      id="zen-tree-search-results"
      role="listbox"
      aria-label="Workspace file search results"
      className="max-h-[60vh] min-h-[8rem] overflow-auto py-1"
    >
      {results.map((result, index) => {
        const normalizedPath = normalizeTreePath(result.file.path);

        return (
          <ZenSearchResultRow
            key={result.file.path}
            result={result}
            index={index}
            active={index === activeIndex}
            tone={gitDecorations.get(normalizedPath)}
            ignored={ignoredPathSet.has(normalizedPath)}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
