// Command and file launcher triggered by Cmd+P.
// Commands are first-class entries now, while file search remains in the same
// surface so the palette can become the future AI action launcher without
// splitting navigation into several competing modals.
import { useState, useEffect, useRef, useMemo } from "react";
import { type FileNode } from "../lib/api";
import {
  CircleSlash,
  FileCode,
  Search,
  TerminalSquare,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { getFileIcon } from "../lib/fileIcons";
import CommandModal from "./CommandModal";
import { type AxonCommand } from "../../shared/commands";

export interface CommandPaletteCommand {
  id: AxonCommand;
  title: string;
  subtitle?: string;
  keywords?: string[];
  disabled?: boolean;
}

interface Props {
  tree: FileNode | null;
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
      disabled: boolean;
      command: CommandPaletteCommand;
    }
  | {
      type: "file";
      id: string;
      title: string;
      subtitle: string;
      file: FileNode;
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

function commandIcon(commandId: AxonCommand): LucideIcon {
  if (commandId.includes("terminal")) return TerminalSquare;
  if (commandId.includes("search")) return Search;
  if (commandId.includes("file") || commandId.includes("tab")) return FileCode;
  return Wrench;
}

export default function CommandPalette({
  tree,
  open,
  commands,
  onClose,
  onFileSelect,
  onCommandSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allFiles = useMemo(() => (tree ? flattenTree(tree) : []), [tree]);

  const filteredItems = useMemo<PaletteItem[]>(() => {
    const rawQuery = query.trim();
    const commandOnly = rawQuery.startsWith(">");
    const normalizedQuery = commandOnly ? rawQuery.slice(1).trim() : rawQuery;

    const commandItems = commands
      .filter((command) => {
        const searchable = [
          command.title,
          command.subtitle ?? "",
          ...(command.keywords ?? []),
        ].join(" ");
        return fuzzyMatch(searchable, normalizedQuery);
      })
      .map<PaletteItem>((command) => ({
        type: "command",
        id: `command:${command.id}`,
        title: command.title,
        subtitle: command.subtitle ?? "Command",
        disabled: command.disabled ?? false,
        command,
      }));

    if (commandOnly) return commandItems.slice(0, 30);

    const fileItems = allFiles
      .filter((file) => fuzzyMatch(file.path, normalizedQuery))
      .slice(0, 20)
      .map<PaletteItem>((file) => {
        const parts = file.path.split("/");
        const title = parts.pop() ?? file.path;
        return {
          type: "file",
          id: `file:${file.path}`,
          title,
          subtitle: parts.join("/"),
          file,
        };
      });

    return [...commandItems.slice(0, 12), ...fileItems].slice(0, 32);
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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222838]">
        <Search size={14} className="text-[#586478] shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="search files or commands..."
          className="flex-1 bg-transparent text-[13px] text-white placeholder-[#364050] outline-none"
        />
        <span className="text-[10px] text-[#364050] border border-[#222838] rounded px-1.5 py-0.5">
          &gt; commands
        </span>
        <span className="text-[10px] text-[#364050] border border-[#222838] rounded px-1.5 py-0.5">
          esc
        </span>
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {filteredItems.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-[#364050]">
            no commands or files found
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
                    ? "cursor-default text-[#3f485a]"
                    : "cursor-pointer"
                } ${
                  active && !item.disabled
                    ? "bg-[#1e2430] text-white"
                    : "text-[#9aa4b8] hover:bg-[#14161e] hover:text-white"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] text-[#586478]">
                    {item.subtitle}
                  </span>
                </span>
                <span className="shrink-0 rounded border border-[#222838] px-1.5 py-0.5 text-[10px] text-[#586478]">
                  command
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left cursor-pointer transition-colors
                    ${active ? "bg-[#1e2430] text-white" : "text-[#9aa4b8] hover:bg-[#14161e] hover:text-white"}`}
            >
              {getFileIcon(item.title)}
              <span className="text-[13px] truncate">{item.title}</span>
              <span className="text-[11px] text-[#364050] truncate ml-auto shrink-0 max-w-48">
                {item.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </CommandModal>
  );
}
