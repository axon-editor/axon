import { useEffect, useMemo, useRef, useState } from "react";
import { History, Replace, Search } from "lucide-react";
import {
  readFile,
  replaceWorkspace,
  searchWorkspace,
  writeFile,
  type WorkspaceSearchResult,
} from "@axon-editor/renderer/shared/lib/api";
import { getFileIcon } from "@axon-editor/renderer/features/sidebar/files/lib/fileIcons";
import CommandModal from "@axon-editor/renderer/shared/components/CommandModal";
import { type WorkspaceIndexSummary } from "@axon-editor/shared/workspaceIndex";

const SEARCH_HISTORY_KEY = "axon.workspaceSearch.history";

interface Props {
  rootPath: string | null;
  open: boolean;
  onClose: () => void;
  onResultSelect: (result: WorkspaceSearchResult, query: string) => void;
}

function getSearchHistoryKey(rootPath: string | null) {
  return `${SEARCH_HISTORY_KEY}:${rootPath ?? "no-workspace"}`;
}

function readSearchHistory(rootPath: string | null) {
  try {
    const value = window.sessionStorage.getItem(getSearchHistoryKey(rootPath));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(rootPath: string | null, items: string[]) {
  window.sessionStorage.setItem(
    getSearchHistoryKey(rootPath),
    JSON.stringify(items.slice(0, 8)),
  );
}

function relativePath(rootPath: string | null, path: string) {
  if (!rootPath || !path.startsWith(`${rootPath}/`)) return path;
  return path.slice(rootPath.length + 1);
}

function isGeneratedSearchPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const generatedSegment = normalizedPath.split("/").some((segment) => {
    const name = segment.toLowerCase();
    return (
      name === ".gocache" ||
      name === "gocache" ||
      name === "go-build" ||
      name.startsWith("go-build") ||
      name.includes("gocache")
    );
  });
  if (generatedSegment) return true;

  return [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".icns",
    ".mp4",
    ".mov",
    ".webm",
    ".mp3",
    ".wav",
    ".zip",
    ".pdf",
    ".wasm",
    ".ttf",
    ".otf",
    ".woff",
    ".woff2",
  ].some((extension) => normalizedPath.toLowerCase().endsWith(extension));
}

function highlightPreview(preview: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [{ text: preview, match: false }];

  const lowerPreview = preview.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const matchIndex = lowerPreview.indexOf(lowerQuery);
  if (matchIndex < 0) return [{ text: preview, match: false }];

  const before = preview.slice(0, matchIndex);
  const match = preview.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = preview.slice(matchIndex + trimmedQuery.length);

  return [
    { text: before, match: false },
    { text: match, match: true },
    { text: after, match: false },
  ].filter((part) => part.text.length > 0);
}

export default function WorkspaceSearchModal({
  rootPath,
  open,
  onClose,
  onResultSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [workspaceIndex, setWorkspaceIndex] =
    useState<WorkspaceIndexSummary | null>(null);
  const [history, setHistory] = useState<string[]>(() =>
    readSearchHistory(rootPath),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, WorkspaceSearchResult[]>());

  const selectedResult = results[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setWorkspaceIndex(null);
    setHistory(readSearchHistory(rootPath));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, rootPath]);

  useEffect(() => {
    if (!open || !rootPath) return;
    let cancelled = false;

    // Workspace search still asks the backend for content matches, but warming
    // the shared metadata index here means future file filters, symbol search,
    // test discovery, and extension activation all start from the same
    // project-aware file set instead of each feature walking the tree on its own.
    void window.axon.getWorkspaceIndex(rootPath).then((summary) => {
      if (!cancelled) setWorkspaceIndex(summary);
    });

    return () => {
      cancelled = true;
    };
  }, [open, rootPath]);

  useEffect(() => {
    if (!open || !rootPath || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const searchKey = `${rootPath}\n${query.trim().toLowerCase()}`;
    const cachedResults = cacheRef.current.get(searchKey);
    if (cachedResults) {
      setResults(cachedResults);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      searchWorkspace(rootPath, query, controller.signal)
        .then((matches) => {
          const visibleMatches = matches.filter(
            (match) => !isGeneratedSearchPath(match.path),
          );
          cacheRef.current.set(searchKey, visibleMatches);
          setResults(visibleMatches);
          setSelectedIndex(0);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error("workspace search failed:", err);
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 80);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, rootPath, query]);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const groupedResults = useMemo(() => {
    return results.map((result) => ({
      ...result,
      relativePath: relativePath(rootPath, result.path),
      name: result.path.split("/").pop() ?? result.path,
    }));
  }, [results, rootPath]);

  const selectResult = (result: WorkspaceSearchResult) => {
    const nextHistory = [
      query.trim(),
      ...history.filter((item) => item !== query.trim()),
    ].filter(Boolean);
    setHistory(nextHistory);
    writeSearchHistory(rootPath, nextHistory);
    onResultSelect(result, query);
    onClose();
  };

  const replaceInFile = async (
    filePath: string,
    searchText: string,
    nextText: string,
  ) => {
    const file = await readFile(filePath);
    const updated = file.content.replaceAll(searchText, nextText);
    if (updated === file.content) return false;
    if (!rootPath) return false;
    await writeFile(filePath, updated, rootPath);
    return true;
  };

  const replaceSelected = async () => {
    if (!selectedResult || !query.trim()) return;
    setReplacing(true);
    try {
      await replaceInFile(selectedResult.path, query.trim(), replaceValue);
      cacheRef.current.clear();
      setQuery((current) => `${current}`);
    } finally {
      setReplacing(false);
    }
  };

  const replaceAllVisible = async () => {
    if (!query.trim() || groupedResults.length === 0) return;
    if (!rootPath) return;
    const replaceRoot = rootPath;
    const confirmed = window.confirm(
      `Replace "${query.trim()}" in ${new Set(groupedResults.map((result) => result.path)).size} file(s)?`,
    );
    if (!confirmed) return;

    setReplacing(true);
    try {
      // Core performs one bounded walk and atomic per-file writes. The previous
      // renderer loop only changed the first 80 visible search results and opened
      // an IPC read/write pair for every file, which was both incomplete and slow
      // on real workspaces.
      await replaceWorkspace(replaceRoot, query.trim(), replaceValue);
      cacheRef.current.clear();
      setResults([]);
      setQuery((current) => `${current}`);
    } finally {
      setReplacing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    }
    if (e.key === "Enter" && selectedResult) {
      selectResult(selectedResult);
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <CommandModal onClose={onClose} width="w-[min(860px,calc(100vw-2rem))]">
      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-4 py-3">
        <Search size={14} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="search workspace..."
          className="flex-1 bg-transparent text-[13px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
        />
        <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
          esc
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-4 py-2">
        <Replace size={14} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
        <input
          value={replaceValue}
          onChange={(event) => setReplaceValue(event.target.value)}
          placeholder="replace with..."
          className="flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
        />
        <button
          type="button"
          disabled={!selectedResult || !query.trim() || replacing}
          onClick={() => void replaceSelected()}
          className="h-7 cursor-pointer rounded-md border border-[var(--axon-panel-border)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
        >
          replace
        </button>
        <button
          type="button"
          disabled={groupedResults.length === 0 || !query.trim() || replacing}
          onClick={() => void replaceAllVisible()}
          className="h-7 cursor-pointer rounded-md border border-[var(--axon-panel-border)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
        >
          replace all
        </button>
      </div>

      <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
        {!rootPath && (
          <div className="px-4 py-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-35">
            open a folder to search
          </div>
        )}
        {rootPath && query.trim().length < 2 && (
          <div className="px-4 py-3">
            <div className="text-[12px] text-[var(--axon-editor-foreground)] opacity-35">
              type at least two characters
            </div>
            {history.length > 0 && (
              <div className="mt-3 space-y-1">
                {history.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuery(item)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                  >
                    <History size={12} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
                    <span className="truncate">{item}</span>
                  </button>
                ))}
              </div>
            )}
            {workspaceIndex && (
              <div className="mt-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
                indexed {workspaceIndex.indexedFileCount.toLocaleString()} files
                {Object.keys(workspaceIndex.languageCounts).length > 0
                  ? ` across ${Object.keys(workspaceIndex.languageCounts).length} languages`
                  : ""}
              </div>
            )}
          </div>
        )}
        {rootPath && query.trim().length >= 2 && loading && (
          <div className="space-y-2 px-4 py-3">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded bg-[var(--axon-panel-overlay-hover)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--axon-panel-overlay-hover)]" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-[var(--axon-panel-overlay-hover)] opacity-70" />
                </div>
              </div>
            ))}
          </div>
        )}
        {rootPath &&
          query.trim().length >= 2 &&
          !loading &&
          groupedResults.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-35">
              no matches found
            </div>
          )}
        {groupedResults.map((result, index) => (
          <button
            key={`${result.path}:${result.line}:${result.column}`}
            onClick={() => selectResult(result)}
            className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left cursor-pointer transition-colors ${
              index === selectedIndex
                ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                : "text-[var(--axon-editor-foreground)] opacity-75 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            }`}
          >
            <span className="mt-0.5 shrink-0">{getFileIcon(result.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] truncate">
                  {result.relativePath}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {result.line}:{result.column}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
                {highlightPreview(result.preview, query).map((part, index) =>
                  part.match ? (
                    <mark
                      key={`${result.path}-hit-${index}`}
                      className="rounded bg-[#3a2f1c] px-0.5 text-[#ffd58a]"
                    >
                      {part.text}
                    </mark>
                  ) : (
                    <span key={`${result.path}-hit-${index}`}>{part.text}</span>
                  ),
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </CommandModal>
  );
}
