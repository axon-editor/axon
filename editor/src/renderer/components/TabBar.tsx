// Renders all open file tabs.
// Active tab is highlighted. Dirty tabs show a purple dot instead of the close button
// until hovered, then the close button appears.
// Middle click closes a tab.
import { X } from "lucide-react";

interface Props {
  openTabs: string[];
  activeFile: string | null;
  dirtyFiles: Record<string, boolean>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export default function TabBar({
  openTabs,
  activeFile,
  dirtyFiles,
  onSelect,
  onClose,
}: Props) {
  if (openTabs.length === 0) {
    return (
      <div className="h-9 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-center px-3">
        <span className="text-[11px] text-neutral-600">no file open</span>
      </div>
    );
  }

  return (
    <div className="h-9 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-end overflow-x-auto px-1 gap-0.5 scrollbar-none">
      {openTabs.map((path) => {
        const name = path.split("/").pop() ?? path;
        const isActive = path === activeFile;
        const isDirty = dirtyFiles[path];

        return (
          <div
            key={path}
            onClick={() => onSelect(path)}
            onAuxClick={(e) => {
              // middle click closes the tab
              if (e.button === 1) onClose(path);
            }}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-t
              border border-b-0 cursor-pointer transition-colors shrink-0 select-none
              ${
                isActive
                  ? "bg-[#1e1e1e] border-[#2a2a2a] text-white"
                  : "bg-transparent border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-[#181818]"
              }`}
          >
            {isDirty ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(path);
                }}
                className="w-3 h-3 flex items-center justify-center"
              >
                <span className="w-2 h-2 rounded-full bg-[#6c5ce7] group-hover:hidden" />
                <X
                  size={11}
                  className="hidden group-hover:block text-neutral-400 hover:text-white"
                />
              </span>
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(path);
                }}
                className="w-3 h-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={11} className="text-neutral-400 hover:text-white" />
              </span>
            )}
            <span>{name}</span>
          </div>
        );
      })}
    </div>
  );
}
