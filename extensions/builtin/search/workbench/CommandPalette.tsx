/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Command and file launcher triggered by Cmd+P.
// Commands are first-class entries now, while file search remains in the same
// surface so the palette can become the future AI action launcher without
// splitting navigation into several competing modals.
import { useState, useEffect, useRef, useMemo } from "react";
import { type FileNode } from "@axon-editor/renderer/shared/lib/backend/api";
import { flattenTree } from "@axon-editor/renderer/shared/lib/files/flattenTree";
import {
  matchScore,
  searchFiles,
} from "@axon-editor/renderer/shared/lib/search/fileSearch";
import {
  CircleSlash,
  FileCode,
  Search,
  TerminalSquare,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { getFileIcon } from "@axon-editor/renderer/features/sidebar/files/lib/icons/fileIcons";
import CommandModal from "@axon-editor/renderer/shared/components/modals/CommandModal";
import ModalSearchInput from "@axon-editor/renderer/shared/components/modals/search/ModalSearchInput";
import { type AxonCommand } from "@axon-editor/shared/commands/commands";
import { type CommandPaletteCommand } from "./lib/types";

const DISABLED_COMMAND_PENALTY = 12;
const COMMAND_ONLY_RESULT_LIMIT = 30;
const FILE_RESULT_LIMIT = 50;
const EMPTY_FILE_RESULT_LIMIT = 20;
const COMMAND_RESULT_LIMIT = 8;
const PALETTE_RESULT_LIMIT = 32;
const PAGE_NAVIGATION_STEP = 6;

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

// commandScore ranks commands by the same matcher used for file paths, so the
// palette keeps one definition of what a strong query match means.
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
  return bestScore - (command.disabled ? DISABLED_COMMAND_PENALTY : 0);
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

    if (commandOnly) return commandItems.slice(0, COMMAND_ONLY_RESULT_LIMIT);

    const fileLimit =
      normalizedQuery.length > 0 ? FILE_RESULT_LIMIT : EMPTY_FILE_RESULT_LIMIT;
    const fileItems = searchFiles(allFiles, normalizedQuery, fileLimit).map<
      PaletteItem
    >(({ file, score }) => {
      const parts = file.path.split("/");
      const title = parts.pop() ?? file.path;
      return {
        type: "file",
        id: `file:${file.path}`,
        title,
        subtitle: parts.join("/"),
        file,
        score,
      };
    });

    if (normalizedQuery.length > 0) return fileItems;
    return [
      ...fileItems,
      ...commandItems.slice(0, COMMAND_RESULT_LIMIT),
    ].slice(0, PALETTE_RESULT_LIMIT);
  }, [allFiles, commands, query]);

  // reset state every time palette opens; the shared search input focuses itself
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
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
        Math.min(
          i + PAGE_NAVIGATION_STEP,
          Math.max(0, filteredItems.length - 1),
        ),
      );
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - PAGE_NAVIGATION_STEP, 0));
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
    <CommandModal
      onClose={onClose}
      header={
        <ModalSearchInput
          value={query}
          onChange={setQuery}
          onKeyDown={handleKeyDown}
          placeholder="Search files by name or path..."
          autoFocus
          ariaLabel="Search files and commands"
          trailing={
            <>
              <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                &gt; commands
              </span>
              {loadingFiles && (
                <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  indexing files
                </span>
              )}
              <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                esc
              </span>
            </>
          }
        />
      }
    >
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
                  {item.shortcut && (
                    <span className="rounded border border-[var(--axon-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                      {item.shortcut}
                    </span>
                  )}
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
