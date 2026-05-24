interface Props {
  onFileSelect: (file: string) => void;
  activeFile: string | null;
}

export default function Sidebar({ onFileSelect, activeFile }: Props) {
  const files = ["main.go", "routes.go", "models.go"];

  return (
    <div className="w-52 bg-[#111111] border-r border-[#1f1f1f] flex flex-col">
      <div className="px-4 py-3 text-[10px] text-neutral-500 uppercase tracking-widest">
        Explorer
      </div>
      <div className="flex flex-col">
        {files.map((f) => (
          <div
            key={f}
            onClick={() => onFileSelect(f)}
            className={`px-4 py-1.5 text-[13px] cursor-pointer transition-colors
              ${
                activeFile === f
                  ? "bg-[#1e1e1e] text-white"
                  : "text-neutral-400 hover:bg-[#1a1a1a] hover:text-white"
              }`}
          >
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}
