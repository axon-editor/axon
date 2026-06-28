import { FileCode2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type FileSymbol,
  type FileSymbolKind,
} from "../sidebar/files/lib/fileSymbols";

interface Props {
  activeSymbolId?: string | null;
  breadcrumbSegments: string[];
  filePath: string;
  symbols: FileSymbol[];
  onSelect: (symbol: FileSymbol) => void;
}

const groupLabels: Record<FileSymbolKind, string> = {
  class: "Types",
  enum: "Types",
  interface: "Types",
  namespace: "Types",
  struct: "Types",
  type: "Types",
  function: "Functions",
  method: "Methods",
  variable: "Constants",
};

const groupOrder = ["Types", "Functions", "Methods", "Constants"] as const;

function groupSymbols(symbols: FileSymbol[]) {
  return groupOrder
    .map((label) => ({
      label,
      symbols: symbols.filter((symbol) => groupLabels[symbol.kind] === label),
    }))
    .filter((group) => group.symbols.length > 0);
}

export default function BufferSymbolsPopover({
  activeSymbolId,
  breadcrumbSegments,
  filePath,
  symbols,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const parentPath = filePath.split(/[\\/]/).slice(0, -1).join("/");
  const filteredSymbols = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return symbols;
    return symbols.filter((symbol) =>
      [symbol.name, symbol.kind, symbol.preview]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, symbols]);
  const groupedSymbols = useMemo(
    () => groupSymbols(filteredSymbols),
    [filteredSymbols],
  );

  return (
    <div className="absolute left-3 top-[42px] z-40 w-[min(560px,calc(100%-24px))] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_20px_54px_rgba(0,0,0,0.48)]">
      <div className="border-b border-[var(--axon-panel-border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 size={14} className="shrink-0 text-[var(--axon-syntax-function)]" />
          <span className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
            {fileName}
          </span>
          <span className="shrink-0 rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
            Buffer symbols
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
          {breadcrumbSegments.map((segment, index) => (
            <span
              key={`${segment}:${index}`}
              className={
                index === breadcrumbSegments.length - 1
                  ? "truncate text-[var(--axon-editor-foreground)] opacity-75"
                  : "truncate"
              }
            >
              {segment}
              {index < breadcrumbSegments.length - 1 ? (
                <span className="px-1 text-[var(--axon-editor-foreground)] opacity-25">/</span>
              ) : null}
            </span>
          ))}
          {breadcrumbSegments.length === 0 ? (
            <span className="truncate">{parentPath}</span>
          ) : null}
        </div>
      </div>
      <div className="flex h-9 items-center gap-2 border-b border-[var(--axon-panel-border)] px-2">
        <Search size={13} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search symbols in this buffer"
          autoFocus
          className="h-7 min-w-0 flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
        />
      </div>
      <div className="max-h-[360px] overflow-y-auto py-1">
        {groupedSymbols.map((group) => (
          <div key={group.label} className="py-1">
            <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
              {group.label}
            </div>
            {group.symbols.map((symbol) => (
              <button
                key={symbol.id}
                type="button"
                onClick={() => onSelect(symbol)}
                className={`grid w-full cursor-pointer grid-cols-[76px_minmax(0,1fr)_64px] gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                  symbol.id === activeSymbolId
                    ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                    : "text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
                }`}
              >
                <span className="truncate rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-syntax-function)]">
                  {symbol.kind}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {symbol.name}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                    {symbol.preview}
                  </span>
                </span>
                <span className="text-right text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {symbol.line}:{symbol.column}
                </span>
              </button>
            ))}
          </div>
        ))}
        {filteredSymbols.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            no symbols
          </div>
        ) : null}
      </div>
    </div>
  );
}
