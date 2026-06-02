// Welcome screen shown when a pane has no open files.
// Shows the Axon logo, quick action buttons, and recent folders.
import { FolderOpen, FilePlus, Clock, ChevronRight, X } from "lucide-react";
import { publicAsset } from "../../lib/assets";
import { getRecentFolders } from "../sidebar/index";
import Tooltip from "../Tooltip";

interface Props {
  onOpenFolder: () => void;
  onNewFile: () => void;
  onSelectRecentFolder: (path: string) => void;
  onClosePane?: () => void;
}

export default function EmptyPane({
  onOpenFolder,
  onNewFile,
  onSelectRecentFolder,
  onClosePane,
}: Props) {
  const recentFolders = getRecentFolders().slice(0, 5);

  return (
    <div className="relative flex h-full select-none flex-col items-center justify-center bg-[#0b0e14] px-8">
      {onClosePane ? (
        <Tooltip label="Close empty pane" side="left">
          <button
            type="button"
            onClick={onClosePane}
            aria-label="Close empty pane"
            className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#364050] transition-colors hover:bg-[#151923] hover:text-white"
          >
            <X size={13} />
          </button>
        </Tooltip>
      ) : null}
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <img
            src={publicAsset("axon.png")}
            alt="Axon"
            className="mb-1 h-22 w-22 opacity-80"
            draggable={false}
          />
          <span className="text-[15px] font-semibold tracking-wide text-[#c8d0e0]">
            Axon
          </span>
          <span className="text-[11px] text-[#364050]">
            your editor, your rules
          </span>
          <div className="my-1 w-full border-t border-[#171c26]" />
          <span className="max-w-65 text-center text-[11px] leading-5 text-[#364050]">
            Open a file, split from the sidebar, or drop a file or tab here.
          </span>
        </div>

        <div className="flex w-full gap-2">
          <button
            onClick={onOpenFolder}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#222838] bg-[#0e1018] px-3 py-2.5 text-[12px] text-[#9aa4b8] transition-colors hover:border-[#3a455a] hover:bg-[#141923] hover:text-white"
          >
            <FolderOpen size={13} className="shrink-0" />
            open folder
          </button>
          <button
            onClick={onNewFile}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#222838] bg-[#0e1018] px-3 py-2.5 text-[12px] text-[#9aa4b8] transition-colors hover:border-[#3a455a] hover:bg-[#141923] hover:text-white"
          >
            <FilePlus size={13} className="shrink-0" />
            new file
          </button>
        </div>

        {recentFolders.length > 0 && (
          <div className="flex w-full flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5">
              <Clock size={11} className="text-[#364050]" />
              <span className="text-[10px] uppercase tracking-widest text-[#364050]">
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
                  className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-[#11151c]"
                >
                  <FolderOpen
                    size={13}
                    className="shrink-0 text-[#364050] group-hover:text-[#80c8e0] transition-colors"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
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
      </div>
    </div>
  );
}
