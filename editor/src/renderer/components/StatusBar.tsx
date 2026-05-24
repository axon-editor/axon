interface Props {
  activeFile: string | null;
}

export default function StatusBar({ activeFile }: Props) {
  return (
    <div className="h-6 bg-[#6c5ce7] flex items-center px-3 gap-4 text-[11px] text-white/90">
      <span className="font-semibold tracking-wide">Axon</span>
      <div className="ml-auto flex items-center gap-4">
        {activeFile && <span>Go</span>}
        <span>UTF-8</span>
        <span>Ln 1, Col 1</span>
      </div>
    </div>
  );
}
