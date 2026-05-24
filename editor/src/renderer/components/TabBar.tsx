// Renders the open file tabs.
// Shows a dot indicator on tabs with unsaved changes (dirty state).
// Close button clears the active file, will expand to multi-tab in next step.
interface Props {
  activeFile: string | null;
  dirtyFiles: Record<string, boolean>;
  onClose: () => void;
}

export default function TabBar({ activeFile, dirtyFiles, onClose }: Props) {
  const isDirty = activeFile ? dirtyFiles[activeFile] : false;

  return (
    <div className="h-9 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-end px-2 gap-1">
      {activeFile ? (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e1e] border border-[#2a2a2a] border-b-0 rounded-t text-[12px] text-neutral-300">
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] inline-block" />
          )}
          <span>{activeFile.split("/").pop()}</span>
          <span
            onClick={onClose}
            className="text-neutral-600 hover:text-white cursor-pointer leading-none ml-1"
          >
            ×
          </span>
        </div>
      ) : (
        <span className="text-[11px] text-neutral-600 pb-2 px-2">
          no file open
        </span>
      )}
    </div>
  );
}
