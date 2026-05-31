// Floating context menu for file and folder operations.
// Renders inline input for create actions since Electron blocks native dialogs.
// Closes on outside click via document mousedown listener.
import { useEffect, useRef, useState } from "react";
import { Columns2, FilePlus, FolderPlus, Trash2 } from "lucide-react";
import {
  type FileNode,
  createFile,
  createDir,
  deleteEntry,
} from "../../lib/api";

interface Props {
  menu: { x: number; y: number; node: FileNode };
  onClose: () => void;
  onRefresh: () => void;
  onSplitFile?: (filePath: string) => void;
}

export default function ContextMenu({
  menu,
  onClose,
  onRefresh,
  onSplitFile,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"menu" | "file" | "folder" | "delete">(
    "menu",
  );
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (mode === "file" || mode === "folder") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  const basePath = menu.node.is_dir
    ? menu.node.path
    : menu.node.path.split("/").slice(0, -1).join("/");

  const handleConfirmCreate = async () => {
    const name = inputValue.trim();
    if (!name) return;
    if (mode === "file") await createFile(`${basePath}/${name}`);
    if (mode === "folder") await createDir(`${basePath}/${name}`);
    onRefresh();
    onClose();
  };

  const handleDelete = async () => {
    await deleteEntry(menu.node.path);
    onRefresh();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirmCreate();
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[#14161e] border border-[#222838] rounded shadow-xl py-1 min-w-48"
      style={{ top: menu.y, left: menu.x }}
    >
      {mode === "menu" && (
        <>
          <button
            onClick={() => setMode("file")}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
          >
            <FilePlus size={12} />
            new file
          </button>
          <button
            onClick={() => setMode("folder")}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
          >
            <FolderPlus size={12} />
            new folder
          </button>
          <div className="my-1 border-t border-[#222838]" />
          <button
            onClick={() => setMode("delete")}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-[#1e2430] hover:text-red-300 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            delete
          </button>
        </>
      )}

      {(mode === "file" || mode === "folder") && (
        <div className="px-3 py-2 flex flex-col gap-2">
          <span className="text-[11px] text-[#586478]">
            {mode === "file" ? "file name" : "folder name"}
          </span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-[#0e1018] border border-[#222838] rounded px-2 py-1 text-[12px] text-white outline-none focus:border-[#80c8e0] w-full"
            placeholder={mode === "file" ? "index.go" : "pkg"}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="text-[11px] text-[#586478] hover:text-white px-2 py-1 cursor-pointer"
            >
              cancel
            </button>
            <button
              onClick={handleConfirmCreate}
              className="text-[11px] bg-[#80c8e0] text-[#0e1018] px-3 py-1 rounded hover:bg-[#9dd4e8] cursor-pointer font-medium"
            >
              create
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="px-3 py-2 flex flex-col gap-2">
          <span className="text-[11px] text-[#9aa4b8]">
            delete <span className="text-white">{menu.node.name}</span>?
          </span>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="text-[11px] text-[#586478] hover:text-white px-2 py-1 cursor-pointer"
            >
              cancel
            </button>
            <button
              onClick={handleDelete}
              className="text-[11px] bg-red-500 text-white px-3 py-1 rounded hover:bg-red-400 cursor-pointer"
            >
              delete
            </button>
          </div>
        </div>
      )}

      {onSplitFile && !menu.node.is_dir && (
        <>
          <div className="my-1 border-t border-[#222838]" />
          <button
            onClick={() => {
              onSplitFile(menu.node.path);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
          >
            <Columns2 size={12} />
            split right
          </button>
        </>
      )}
    </div>
  );
}
