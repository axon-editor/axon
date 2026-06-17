// Modal that shows recent folders and lets the user open a new one.
// Recent folders are persisted in localStorage keyed by axon:recentFolders.
// Clicking a recent folder opens it directly.
// Clicking "open folder" triggers the native folder picker.
// Closes on outside click or Escape.
import { Clock, FolderOpen, Trash2, X } from "lucide-react";
import CommandModal from "../../../shared/components/CommandModal";

interface Props {
  recentFolders: string[];
  onSelect: (path: string) => void;
  onOpenNew: () => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onClearSession: () => void;
  onClose: () => void;
}

export default function FolderPicker({
  recentFolders,
  onSelect,
  onOpenNew,
  onRemoveRecent,
  onClearRecent,
  onClearSession,
  onClose,
}: Props) {
  return (
    <CommandModal title="open folder" onClose={onClose} width="w-[480px]">
      <div className="p-2">
        <button
          onClick={() => {
            onOpenNew();
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
              <button
                type="button"
                onClick={onClearRecent}
                className="ml-auto flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] text-[#586478] transition-colors hover:bg-[#2a1517] hover:text-[#ff7b72]"
              >
                <Trash2 size={11} />
                clear
              </button>
            </div>
            {recentFolders.map((folder) => {
              const parts = folder.split("/");
              const name = parts[parts.length - 1];
              const parent = parts.slice(0, -1).join("/");
              return (
                <div
                  key={folder}
                  className="group flex w-full items-center gap-2 rounded px-1 transition-colors hover:bg-[#1e2430]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(folder);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-2 text-left"
                  >
                    <FolderOpen
                      size={14}
                      className="shrink-0 text-[#586478] transition-colors group-hover:text-[#80c8e0]"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[12px] text-[#c8d0e0]">
                        {name}
                      </span>
                      <span className="truncate text-[10px] text-[#364050]">
                        {parent}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveRecent(folder)}
                    aria-label={`Remove ${name} from recent folders`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[#364050] opacity-0 transition-all hover:bg-[#2a1517] hover:text-[#ff7b72] group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </>
        )}

        {recentFolders.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-[#364050] text-center">
            no recent folders
          </div>
        )}

        <div className="mt-2 border-t border-[#1d2432] pt-2">
          <button
            type="button"
            onClick={onClearSession}
            className="flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-[12px] text-[#8d98aa] transition-colors hover:bg-[#1e2430] hover:text-white"
          >
            <Trash2 size={13} className="shrink-0 text-[#586478]" />
            <span>clear saved workspace session</span>
          </button>
        </div>
      </div>
    </CommandModal>
  );
}
