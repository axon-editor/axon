import { ChevronRight } from "lucide-react";
import { type FileSymbol } from "../sidebar/files/lib/fileSymbols";
import BufferSymbolsPopover from "./BufferSymbolsPopover";

interface Props {
  activeSymbol: FileSymbol | undefined;
  breadcrumbSegments: string[];
  filePath: string;
  open: boolean;
  symbols: FileSymbol[];
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
  onSelectSymbol,
  onToggleOpen,
  onClose,
}: Props) {
  return (
    <div
      className="relative z-30 flex h-11 min-w-0 shrink-0 items-center gap-1 border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)]"
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
            <ChevronRight size={12} className="shrink-0 opacity-35" />
          )}
          <button
            type="button"
            onClick={() => {
              if (index === breadcrumbSegments.length - 1) onToggleOpen();
            }}
            disabled={index !== breadcrumbSegments.length - 1}
            className={
              index === breadcrumbSegments.length - 1
                ? "max-w-[260px] cursor-pointer truncate rounded px-1.5 py-1 text-[var(--axon-editor-foreground)] opacity-75 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                : "max-w-[180px] truncate px-1.5 py-1 text-left opacity-55"
            }
          >
            {segment}
          </button>
        </span>
      ))}
      {activeSymbol && (
        <>
          <ChevronRight size={12} className="shrink-0 opacity-35" />
          <button
            type="button"
            onClick={onToggleOpen}
            className="min-w-0 cursor-pointer truncate rounded px-1.5 py-1 text-left text-[var(--axon-syntax-function)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
          >
            {activeSymbol.name}
          </button>
          <span className="shrink-0 rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
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
