// Fuzzy file search palette triggered by Cmd+P.
// Flattens the file tree into a searchable list, filters by the query,
// and opens the selected file in the editor.
// Closes on Escape, outside click, or after a file is selected.
import { useState, useEffect, useRef, useMemo } from "react";
import { type FileNode } from "../lib/api";
import { Search } from "lucide-react";
import { getFileIcon } from "../lib/fileIcons";

interface Props {
  tree: FileNode | null;
  open: boolean;
  onClose: () => void;
  onFileSelect: (path: string) => void;
}
// flattenTree recursively walks the FileNode tree and returns
// a flat list of all file paths. Directories are skipped since
// the palette only opens files.
function flattenTree(node: FileNode): FileNode[] {
  if (!node.is_dir) return [node];
  return (node.children ?? []).flatMap(flattenTree);
}

// fuzzyMatch returns true if all characters in query appear
// in order within the target string. Case insensitive.
// Simple but effective for file path searching.
function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ti < t.length && t[ti] !== q[qi]) ti++;
    if (ti >= t.length) return false;
    ti++;
  }
  return true;
}

export default function CommandPalette({
  tree,
  open,
  onClose,
  onFileSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allFiles = useMemo(() => (tree ? flattenTree(tree) : []), [tree]);

  const filtered = useMemo(() => {
    return allFiles.filter((f) => fuzzyMatch(f.path, query)).slice(0, 20);
  }, [allFiles, query]);

  // reset state every time palette opens and focus the input
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // keep selected item in view as keyboard navigates the list
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = (file: FileNode) => {
    onFileSelect(file.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-140 bg-[#14161e] border border-[#222838] rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222838]">
          <Search size={14} className="text-neutral-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="search files..."
            className="flex-1 bg-transparent text-[13px] text-white placeholder-neutral-600 outline-none"
          />
          <span className="text-[10px] text-neutral-600 border border-[#2a2a2a] rounded px-1.5 py-0.5">
            esc
          </span>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-neutral-600">
              no files found
            </div>
          )}
          {filtered.map((file, i) => {
            const parts = file.path.split("/");
            const name = parts.pop() ?? file.path;
            const dir = parts.join("/");

            return (
              <div
                key={file.path}
                onClick={() => handleSelect(file)}
                className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors
                  ${
                    i === selectedIndex
                      ? "bg-[#1e2430] text-[#c8d0e0]"
                      : "text-neutral-400 hover:bg-[#14161e] hover:text-white"
                  }`}
              >
                {getFileIcon(name)}
                <span className="text-[13px] truncate">{name}</span>
                <span className="text-[11px] text-neutral-600 truncate ml-auto shrink-0 max-w-48">
                  {dir}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
