// Modal that shows recent folders and lets the user open a new one.
// Recent folders are persisted in localStorage keyed by axon:recentFolders.
// Clicking a recent folder opens it directly.
// Clicking "open folder" triggers the native folder picker.
// Closes on outside click or Escape.
import { useEffect, useRef } from "react";
import { FolderOpen, Clock, X } from "lucide-react";
import CommandModal from "../CommandModal";

interface Props {
  recentFolders: string[];
  onSelect: (path: string) => void;
  onOpenNew: () => void;
  onClose: () => void;
}

export default function FolderPicker({
  recentFolders,
  onSelect,
  onOpenNew,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  return (
    <CommandModal title="open folder" onClose={onClose} width="w-[480px]">
      <div className="p-2">
        <button
          onClick={() => {
            onOpenNew();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-[12px] text-[#80c8e0] hover:bg-[#1e2430] transition-colors cursor-pointer"
        >
          <FolderOpen size={14} className="shrink-0" />
          <span>browse for folder...</span>
        </button>

        {recentFolders.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 mt-1">
              <Clock size={11} className="text-[#364050]" />
              <span className="text-[10px] text-[#364050] uppercase tracking-widest">
                recent
              </span>
            </div>
            {recentFolders.map((folder) => {
              const parts = folder.split("/");
              const name = parts[parts.length - 1];
              const parent = parts.slice(0, -1).join("/");
              return (
                <button
                  key={folder}
                  onClick={() => {
                    onSelect(folder);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded text-left hover:bg-[#1e2430] transition-colors cursor-pointer group"
                >
                  <FolderOpen
                    size={14}
                    className="shrink-0 text-[#586478] group-hover:text-[#80c8e0] transition-colors"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] text-[#c8d0e0] truncate">
                      {name}
                    </span>
                    <span className="text-[10px] text-[#364050] truncate">
                      {parent}
                    </span>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {recentFolders.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-[#364050] text-center">
            no recent folders
          </div>
        )}
      </div>
    </CommandModal>
  );
}
