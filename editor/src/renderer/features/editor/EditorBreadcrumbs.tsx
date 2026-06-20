import { ChevronRight } from "lucide-react";
import {
  type FileSymbol,
} from "../sidebar/files/lib/fileSymbols";
import BufferSymbolsPopover from "./BufferSymbolsPopover";

interface Props {
  activeSymbol: FileSymbol | undefined;
  breadcrumbSegments: string[];
  filePath: string;
  open: boolean;
  symbols: FileSymbol[];
  onJumpToSymbol: (line: number, column: number) => void;
  onSelectSymbol: (symbol: FileSymbol) => void;
  onToggleOpen: () => void;
  onClose: () => void;
}

export default function EditorBreadcrumbs({
  activeSymbol,
  breadcrumbSegments,
  filePath,
  open,
  symbols,
  onJumpToSymbol,
  onSelectSymbol,
  onToggleOpen,
  onClose,
}: Props) {
  return (
    <div
      className="relative flex h-11 min-w-0 shrink-0 items-center gap-1 border-b border-[#1d2432] bg-[#0a0c12] px-3 text-[12px] text-[#7f8aa3]"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {breadcrumbSegments.map((segment, index) => (
        <span
          key={`${segment}:${index}`}
          className="flex min-w-0 items-center gap-1"
        >
          {index > 0 && (
            <ChevronRight size={12} className="shrink-0 text-[#3d4658]" />
          )}
          <button
            type="button"
            onClick={() => {
              if (index === breadcrumbSegments.length - 1) onToggleOpen();
            }}
            disabled={index !== breadcrumbSegments.length - 1}
            className={
              index === breadcrumbSegments.length - 1
                ? "max-w-[260px] cursor-pointer truncate rounded px-1.5 py-1 text-[#c8d0e0] transition-colors hover:bg-[#151923] hover:text-white"
                : "max-w-[180px] truncate px-1.5 py-1 text-left"
            }
          >
            {segment}
          </button>
        </span>
      ))}
      {activeSymbol && (
        <>
          <ChevronRight size={12} className="shrink-0 text-[#3d4658]" />
          <button
            type="button"
            onClick={() => onJumpToSymbol(activeSymbol.line, activeSymbol.column)}
            className="min-w-0 cursor-pointer truncate rounded px-1.5 py-1 text-left text-[#80c8e0] transition-colors hover:bg-[#10202a] hover:text-[#dff7ff]"
          >
            {activeSymbol.name}
          </button>
          <span className="shrink-0 rounded bg-[#151b27] px-1.5 py-0.5 text-[10px] text-[#586478]">
            {activeSymbol.kind}
          </span>
        </>
      )}
      {open && (
        <BufferSymbolsPopover
          activeSymbolId={activeSymbol?.id}
          breadcrumbSegments={breadcrumbSegments}
          filePath={filePath}
          symbols={symbols}
          onSelect={onSelectSymbol}
        />
      )}
    </div>
  );
}
