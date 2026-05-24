interface Props {
  activeFile: string | null;
  onClose: () => void;
}

export default function TabBar({ activeFile, onClose }: Props) {
  return (
    <div className="h-9 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-end px-2 gap-1">
      {activeFile ? (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e1e] border border-[#2a2a2a] border-b-0 rounded-t text-[12px] text-neutral-300">
          <span>{activeFile}</span>
          <span
            onClick={onClose}
            className="text-neutral-600 hover:text-white cursor-pointer leading-none"
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
