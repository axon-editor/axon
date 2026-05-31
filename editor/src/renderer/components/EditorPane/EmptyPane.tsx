// Welcome screen shown when a pane has no open files.
// Shows the Axon logo, quick action buttons, recent folders,
// and keyboard shortcut hints.
import { FolderOpen, FilePlus, Clock, ChevronRight } from "lucide-react";
import { getRecentFolders } from "../sidebar/index";

interface Props {
  onOpenFolder: () => void;
  onNewFile: () => void;
  onSelectRecentFolder: (path: string) => void;
}

export default function EmptyPane({
  onOpenFolder,
  onNewFile,
  onSelectRecentFolder,
}: Props) {
  const recentFolders = getRecentFolders().slice(0, 5);

  return (
    <div className="h-full flex flex-col items-center justify-center select-none px-8">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <img
            src="/axon.png"
            alt="Axon"
            className="w-22 h-22 opacity-80 mb-1"
            draggable={false}
          />
          <span className="text-[15px] font-semibold text-[#c8d0e0] tracking-wide">
            Axon
          </span>
          <span className="text-[11px] text-[#364050]">
            your editor, your rules
          </span>
          <div className="w-full border-t border-[#1a1c24] my-1" />
          <span className="max-w-65 text-[11px] leading-5 text-[#364050] text-center">
            Open a file, split from the sidebar, or drop a file or tab here.
          </span>
        </div>

        <div className="w-full flex gap-2">
          <button
            onClick={onOpenFolder}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#14161e] border border-[#222838] rounded-lg text-[12px] text-[#9aa4b8] hover:text-white hover:border-[#80c8e0] hover:bg-[#1e2430] transition-all cursor-pointer"
          >
            <FolderOpen size={13} className="shrink-0" />
            open folder
          </button>
          <button
            onClick={onNewFile}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#14161e] border border-[#222838] rounded-lg text-[12px] text-[#9aa4b8] hover:text-white hover:border-[#80c8e0] hover:bg-[#1e2430] transition-all cursor-pointer"
          >
            <FilePlus size={13} className="shrink-0" />
            new file
          </button>
        </div>

        {recentFolders.length > 0 && (
          <div className="w-full flex flex-col gap-1">
            <div className="flex items-center gap-1.5 mb-1">
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
                  onClick={() => onSelectRecentFolder(folder)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#14161e] transition-colors cursor-pointer group text-left"
                >
                  <FolderOpen
                    size={13}
                    className="shrink-0 text-[#364050] group-hover:text-[#80c8e0] transition-colors"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] text-[#9aa4b8] group-hover:text-white transition-colors truncate">
                      {name}
                    </span>
                    <span className="text-[10px] text-[#364050] truncate">
                      {parent}
                    </span>
                  </div>
                  <ChevronRight
                    size={11}
                    className="text-[#364050] group-hover:text-[#586478] shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                  />
                </button>
              );
            })}
          </div>
        )}

        <div className="w-full flex flex-col gap-1.5 pt-2 border-t border-[#1a1c24]">
          {[
            { keys: "⌘P", desc: "search files" },
            { keys: "⌘J", desc: "toggle terminal" },
            { keys: "⌘\\", desc: "split editor" },
          ].map(({ keys, desc }) => (
            <div key={keys} className="flex items-center justify-between px-1">
              <span className="text-[11px] text-[#364050]">{desc}</span>
              <kbd className="text-[10px] text-[#364050] bg-[#14161e] border border-[#222838] rounded px-1.5 py-0.5 font-mono">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
