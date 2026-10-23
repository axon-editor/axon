/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Search runs over the indexed project file list rather than only the tree
// nodes that happen to be expanded. The palette already indexes the same files,
// so both surfaces share one matcher and a query can reach a file inside a
// collapsed folder.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { searchFiles } from "@axon-editor/renderer/shared/lib/search/fileSearch";
import { SEARCH_RESULT_LIMIT } from "../../shared/zenTreeConstants";
import type { ZenProjectFile, ZenSearchResult } from "../../shared/types";

interface Options {
  folderPath: string | null;
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

export function useZenFileSearch({
  folderPath,
  onFileSelect,
  onClose,
}: Options) {
  const [query, setQuery] = useState("");
  const [projectFiles, setProjectFiles] = useState<ZenProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const searching = query.trim().length > 0;
  const results = useMemo<ZenSearchResult[]>(
    () =>
      searching ? searchFiles(projectFiles, query, SEARCH_RESULT_LIMIT) : [],
    [projectFiles, query, searching],
  );
  const activeIndex =
    results.length === 0 ? 0 : Math.min(selectedIndex, results.length - 1);

  useEffect(() => {
    if (!folderPath) {
      setProjectFiles([]);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void window.axon
      .listProjectFiles(folderPath)
      .then((files) => {
        if (!cancelled) setProjectFiles(files);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectFiles([]);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-zen-search-index="${activeIndex}"]`,
      )
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results.length]);

  const selectResult = useCallback(
    (index: number) => {
      const result = results[index];
      if (!result) return;

      onFileSelect(result.file.path);
      onClose();
    },
    [onClose, onFileSelect, results],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!searching) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex(
        Math.max(0, Math.min(results.length - 1, activeIndex + delta)),
      );
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setSelectedIndex(event.key === "Home" ? 0 : results.length - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(activeIndex);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      setSelectedIndex(0);
    }
  };

  return {
    query,
    setQuery,
    searching,
    results,
    loading,
    error,
    activeIndex,
    listRef,
    handleKeyDown,
    selectResult,
  };
}
