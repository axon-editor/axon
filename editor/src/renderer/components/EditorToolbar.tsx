// Top right toolbar with three icon buttons.
// Plus opens a new action dropdown below the button.
// Split opens layout options dropdown.
// Maximize toggles zen mode.
import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Columns2,
  Maximize2,
  Minimize2,
  Terminal,
  FileText,
  FolderOpen,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  Settings,
  Search,
  GitCompare,
} from "lucide-react";
import Tooltip from "./Tooltip";

interface Props {
  onNewFile: () => void;
  onOpenFile: () => void;
  onSearch: () => void;
  onDiff: () => void;
  onNewTerminal: () => void;
  onSplit: (direction: "right" | "left" | "up" | "down") => void;
  onZenMode: () => void;
  onSettings: () => void;
  isZenMode: boolean;
}

type DropdownType = "new" | "split" | null;

export default function EditorToolbar({
  onNewFile,
  onOpenFile,
  onSearch,
  onDiff,
  onNewTerminal,
  onSplit,
  onZenMode,
  onSettings,
  isZenMode,
}: Props) {
  const [dropdown, setDropdown] = useState<DropdownType>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        newRef.current &&
        !newRef.current.contains(e.target as Node) &&
        splitRef.current &&
        !splitRef.current.contains(e.target as Node)
      ) {
        setDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (type: DropdownType) => {
    setDropdown((prev) => (prev === type ? null : type));
  };

  return (
    <div className="flex items-center gap-0.5 px-2">
      {/* new action button */}
      <div ref={newRef} className="relative">
        <Tooltip label="New..." side="bottom">
          <button
            onClick={() => toggle("new")}
            aria-label="New..."
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer
            ${dropdown === "new" ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"}`}
          >
            <Plus size={14} />
          </button>
        </Tooltip>

        {dropdown === "new" && (
          <div className="absolute right-0 top-8 w-48 bg-[#14161e] border border-[#222838] rounded-lg shadow-2xl py-1 z-50">
            <button
              onClick={() => {
                onNewFile();
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <FileText size={13} className="shrink-0" />
              new file
            </button>
            <button
              onClick={() => {
                onOpenFile();
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <FolderOpen size={13} className="shrink-0" />
              open file
            </button>
            <div className="my-1 border-t border-[#222838]" />
            <button
              onClick={() => {
                onNewTerminal();
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <Terminal size={13} className="shrink-0" />
              new terminal
            </button>
          </div>
        )}
      </div>

      <div ref={splitRef} className="relative">
        <Tooltip label="Split editor" side="bottom">
          <button
            onClick={() => toggle("split")}
            aria-label="Split editor"
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer
            ${dropdown === "split" ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"}`}
          >
            <Columns2 size={14} />
          </button>
        </Tooltip>

        {dropdown === "split" && (
          <div className="absolute right-0 top-8 w-48 bg-[#14161e] border border-[#222838] rounded-lg shadow-2xl py-1 z-50">
            <button
              onClick={() => {
                onSplit("right");
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <AlignEndVertical size={13} className="shrink-0" />
              split right
            </button>
            <button
              onClick={() => {
                onSplit("left");
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <AlignStartVertical size={13} className="shrink-0" />
              split left
            </button>
            <button
              onClick={() => {
                onSplit("up");
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <AlignStartHorizontal size={13} className="shrink-0" />
              split up
            </button>
            <button
              onClick={() => {
                onSplit("down");
                setDropdown(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
            >
              <AlignEndHorizontal size={13} className="shrink-0" />
              split down
            </button>
          </div>
        )}
      </div>

      <Tooltip label="Search workspace" side="bottom">
        <button
          onClick={onSearch}
          aria-label="Search workspace"
          className="flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"
        >
          <Search size={14} />
        </button>
      </Tooltip>

      <Tooltip label="Compare active file" side="bottom">
        <button
          onClick={onDiff}
          aria-label="Compare active file"
          className="flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"
        >
          <GitCompare size={14} />
        </button>
      </Tooltip>

      <Tooltip label="Settings" side="bottom">
        <button
          onClick={onSettings}
          aria-label="Settings"
          className="flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"
        >
          <Settings size={14} />
        </button>
      </Tooltip>

      <Tooltip label={isZenMode ? "Exit zen mode" : "Zen mode"} side="bottom">
        <button
          onClick={onZenMode}
          aria-label={isZenMode ? "Exit zen mode" : "Zen mode"}
          className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer
          ${isZenMode ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"}`}
        >
          {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </Tooltip>
    </div>
  );
}
