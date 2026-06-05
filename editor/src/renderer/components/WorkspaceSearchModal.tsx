import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  searchWorkspace,
  type WorkspaceSearchResult,
} from "../lib/api";
import { getFileIcon } from "../lib/fileIcons";
import CommandModal from "./CommandModal";

interface Props {
  rootPath: string | null;
  open: boolean;
  onClose: () => void;
  onResultSelect: (result: WorkspaceSearchResult, query: string) => void;
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
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, WorkspaceSearchResult[]>());

  const selectedResult = results[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

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
    onResultSelect(result, query);
    onClose();
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
    <CommandModal onClose={onClose}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222838]">
        <Search size={14} className="text-[#586478] shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="search workspace..."
          className="flex-1 bg-transparent text-[13px] text-white placeholder-[#364050] outline-none"
        />
        <span className="text-[10px] text-[#364050] border border-[#222838] rounded px-1.5 py-0.5">
          esc
        </span>
      </div>

      <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
        {!rootPath && (
          <div className="px-4 py-3 text-[12px] text-[#364050]">
            open a folder to search
          </div>
        )}
        {rootPath && query.trim().length < 2 && (
          <div className="px-4 py-3 text-[12px] text-[#364050]">
            type at least two characters
          </div>
        )}
        {rootPath && query.trim().length >= 2 && loading && (
          <div className="space-y-2 px-4 py-3">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded bg-[#202638]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[#202638]" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-[#171c2a]" />
                </div>
              </div>
            ))}
          </div>
        )}
        {rootPath &&
          query.trim().length >= 2 &&
          !loading &&
          groupedResults.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-[#364050]">
              no matches found
            </div>
          )}
        {groupedResults.map((result, index) => (
          <button
            key={`${result.path}:${result.line}:${result.column}`}
            onClick={() => selectResult(result)}
            className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left cursor-pointer transition-colors ${
              index === selectedIndex
                ? "bg-[#1e2430] text-[#f3f6fb]"
                : "text-[#c4cbd8] hover:bg-[#14161e] hover:text-[#f3f6fb]"
            }`}
          >
            <span className="mt-0.5 shrink-0">{getFileIcon(result.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] truncate">
                  {result.relativePath}
                </span>
                <span className="text-[10px] text-[#586478] shrink-0">
                  {result.line}:{result.column}
                </span>
              </span>
              <span className="block text-[11px] text-[#8f98aa] truncate mt-0.5">
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
