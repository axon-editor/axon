// Command and file launcher triggered by Cmd+P.
// Commands are first-class entries now, while file search remains in the same
// surface so the palette can become the future AI action launcher without
// splitting navigation into several competing modals.
import { useState, useEffect, useRef, useMemo } from "react";
import { type FileNode } from "../../shared/lib/api";
import {
  CircleSlash,
  FileCode,
  Search,
  TerminalSquare,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { getFileIcon } from "../sidebar/files/lib/fileIcons";
import CommandModal from "../../shared/components/CommandModal";
import { type AxonCommand } from "../../../shared/commands";

export interface CommandPaletteCommand {
  id: AxonCommand;
  title: string;
  group?: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
}

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  open: boolean;
  commands: CommandPaletteCommand[];
  onClose: () => void;
  onFileSelect: (path: string) => void;
  onCommandSelect: (command: AxonCommand) => void;
}

type PaletteItem =
  | {
      type: "command";
      id: string;
      title: string;
      subtitle: string;
      group: string;
      shortcut?: string;
      disabled: boolean;
      command: CommandPaletteCommand;
      score: number;
    }
  | {
      type: "file";
      id: string;
      title: string;
      subtitle: string;
      file: FileNode;
      score: number;
    };

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

function matchScore(target: string, query: string): number | null {
  const normalizedTarget = target.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  // Prefer exact and prefix matches, then fall back to substring and fuzzy
  // matching. This keeps "save" near Save Active File while still allowing
  // loose editor-style searches such as "scm" for source control.
  if (!normalizedQuery) return 0;
  if (normalizedTarget === normalizedQuery) return 100;
  if (normalizedTarget.startsWith(normalizedQuery)) return 90;
  if (normalizedTarget.includes(` ${normalizedQuery}`)) return 82;
  if (normalizedTarget.includes(normalizedQuery)) return 70;
  if (fuzzyMatch(normalizedTarget, normalizedQuery)) return 45;

  return null;
}

function commandScore(
  command: CommandPaletteCommand,
  query: string,
): number | null {
  const targets = [
    command.title,
    command.group ?? "",
    command.subtitle ?? "",
    ...(command.keywords ?? []),
  ];
  const scores = targets
    .map((target) => matchScore(target, query))
    .filter((score): score is number => score !== null);

  if (scores.length === 0) return null;
  const bestScore = Math.max(...scores);
  return bestScore - (command.disabled ? 12 : 0);
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[-_.\\/]+/g, " ");
}

function fileScore(file: FileNode, query: string): number | null {
  const title = file.path.split("/").pop() ?? file.path;
  const normalizedQuery = normalizeSearchText(query);
  const titleScore = matchScore(title, query);
  const normalizedTitleScore = matchScore(
    normalizeSearchText(title),
    normalizedQuery,
  );
  const pathScore = matchScore(file.path, query);
  const normalizedPathScore = matchScore(
    normalizeSearchText(file.path),
    normalizedQuery,
  );
  const bestScore = Math.max(
    titleScore ?? -1,
    normalizedTitleScore ?? -1,
    pathScore !== null ? pathScore - 8 : -1,
    normalizedPathScore !== null ? normalizedPathScore - 8 : -1,
  );

  return bestScore < 0 ? null : bestScore;
}

function commandIcon(commandId: AxonCommand): LucideIcon {
  if (commandId.includes("terminal")) return TerminalSquare;
  if (commandId.includes("search")) return Search;
  if (commandId.includes("file") || commandId.includes("tab")) return FileCode;
  return Wrench;
}

export default function CommandPalette({
  tree,
  folderPath,
  open,
  commands,
  onClose,
  onFileSelect,
  onCommandSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [projectFiles, setProjectFiles] = useState<FileNode[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const treeFiles = useMemo(() => (tree ? flattenTree(tree) : []), [tree]);
  const allFiles = projectFiles.length > 0 ? projectFiles : treeFiles;

  useEffect(() => {
    if (!folderPath) {
      setProjectFiles([]);
      return;
    }
    if (!open) return;
    let cancelled = false;
    setLoadingFiles(true);

    void window.axon
      .listProjectFiles(folderPath)
      .then((files) => {
        if (!cancelled) setProjectFiles(files);
      })
      .catch((err) => {
        console.error("failed to index project files:", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath, open]);

  const filteredItems = useMemo<PaletteItem[]>(() => {
    const rawQuery = query.trim();
    const commandOnly = rawQuery.startsWith(">");
    const normalizedQuery = commandOnly ? rawQuery.slice(1).trim() : rawQuery;

    const commandItems = commands
      .map((command) => ({
        command,
        score: commandScore(command, normalizedQuery),
      }))
      .filter(
        (entry): entry is { command: CommandPaletteCommand; score: number } =>
          entry.score !== null,
      )
      .sort(
        (a, b) =>
          b.score - a.score || a.command.title.localeCompare(b.command.title),
      )
      .map<PaletteItem>((command) => ({
        type: "command",
        id: `command:${command.command.id}`,
        title: command.command.title,
        subtitle: command.command.subtitle ?? "Command",
        group: command.command.group ?? "Command",
        shortcut: command.command.shortcut,
        disabled: command.command.disabled ?? false,
        command: command.command,
        score: command.score,
      }));

    if (commandOnly) return commandItems.slice(0, 30);

    const fileItems = allFiles
      .map((file) => ({ file, score: fileScore(file, normalizedQuery) }))
      .filter(
        (entry): entry is { file: FileNode; score: number } =>
          entry.score !== null,
      )
      .sort(
        (a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path),
      )
      .slice(0, 20)
      .map<PaletteItem>((file) => {
        const parts = file.file.path.split("/");
        const title = parts.pop() ?? file.file.path;
        return {
          type: "file",
          id: `file:${file.file.path}`,
          title,
          subtitle: parts.join("/"),
          file: file.file,
          score: file.score,
        };
      });

    if (normalizedQuery.length > 0) return fileItems.slice(0, 50);
    return [...fileItems.slice(0, 20), ...commandItems.slice(0, 8)].slice(0, 32);
  }, [allFiles, commands, query]);

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

  const handleSelect = (item: PaletteItem) => {
    if (item.type === "command") {
      if (item.disabled) return;
      onCommandSelect(item.command.id);
      onClose();
      return;
    }

    onFileSelect(item.file.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) =>
        Math.min(i + 1, Math.max(0, filteredItems.length - 1)),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setSelectedIndex((i) =>
        Math.min(i + 6, Math.max(0, filteredItems.length - 1)),
      );
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 6, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    } else if (e.key === "Enter") {
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
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
    <CommandModal onClose={onClose}>
      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-4 py-3">
        <Search size={14} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files by name or path..."
          className="flex-1 bg-transparent text-[13px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
        />
        <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
          &gt; commands
        </span>
        {loadingFiles ? (
          <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
            indexing files
          </span>
        ) : null}
        <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
          esc
        </span>
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {filteredItems.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-35">
            {loadingFiles
              ? "indexing project files..."
              : query.trim().startsWith(">")
                ? "no commands found"
                : "no files found"}
          </div>
        )}
        {filteredItems.map((item, i) => {
          const active = i === selectedIndex;
          if (item.type === "command") {
            const Icon = item.disabled
              ? CircleSlash
              : commandIcon(item.command.id);
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                disabled={item.disabled}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                  item.disabled
                    ? "cursor-default text-[var(--axon-editor-foreground)] opacity-35"
                    : "cursor-pointer"
                } ${
                  active && !item.disabled
                    ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                    : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
                    {item.subtitle}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {item.shortcut ? (
                    <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                      {item.shortcut}
                    </span>
                  ) : null}
                  <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                    {item.group}
                  </span>
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left cursor-pointer transition-colors
                    ${active ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]" : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"}`}
            >
              {getFileIcon(item.title)}
              <span className="text-[13px] truncate">{item.title}</span>
              <span className="ml-auto max-w-48 shrink-0 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
                {item.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </CommandModal>
  );
}
