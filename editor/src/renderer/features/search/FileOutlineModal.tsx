import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, Box, CircleDot, FunctionSquare, Search } from "lucide-react";
import { type FileSymbol } from "../sidebar/files/lib/fileSymbols";
import CommandModal from "../../shared/components/CommandModal";

interface Props {
  open: boolean;
  filePath: string | null;
  symbols: FileSymbol[];
  onClose: () => void;
  onSelect: (symbol: FileSymbol) => void;
}

function symbolIcon(kind: FileSymbol["kind"]) {
  if (kind === "function" || kind === "method") return FunctionSquare;
  if (kind === "class" || kind === "struct") return Box;
  if (kind === "interface" || kind === "type" || kind === "enum" || kind === "namespace") return Braces;
  return CircleDot;
}

function getFileName(path: string | null) {
  if (!path) return "No file";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export default function FileOutlineModal({
  open,
  filePath,
  symbols,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filteredSymbols = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return symbols;
    return symbols.filter((symbol) =>
      `${symbol.name} ${symbol.kind} ${symbol.preview}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, symbols]);

  const selectedSymbol = filteredSymbols[selectedIndex];

  const selectSymbol = (symbol: FileSymbol) => {
    onSelect(symbol);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) =>
        Math.min(index + 1, filteredSymbols.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && selectedSymbol) {
      selectSymbol(selectedSymbol);
    }
    if (event.key === "Escape") onClose();
  };

  if (!open) return null;

  return (
    <CommandModal title={getFileName(filePath)} onClose={onClose} width="w-[720px]">
      <div className="flex items-center gap-2 border-b border-[#222838] px-4 py-3">
        <Search size={14} className="shrink-0 text-[#586478]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="search symbols..."
          className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder-[#364050]"
        />
      </div>

      <div className="max-h-96 overflow-y-auto py-1">
        {!filePath && (
          <div className="px-4 py-3 text-[12px] text-[#586478]">
            Open a file to view its outline.
          </div>
        )}
        {filePath && filteredSymbols.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-[#586478]">
            No symbols found in this file.
          </div>
        )}
        {filteredSymbols.map((symbol, index) => {
          const Icon = symbolIcon(symbol.kind);
          return (
            <button
              key={symbol.id}
              onClick={() => selectSymbol(symbol)}
              className={`grid w-full cursor-pointer grid-cols-[18px_1fr_70px] items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                index === selectedIndex
                  ? "bg-[#1e2430] text-white"
                  : "text-[#9aa4b8] hover:bg-[#14161e] hover:text-white"
              }`}
            >
              <Icon size={13} className="text-[#80c8e0]" />
              <span className="min-w-0">
                <span className="block truncate text-[12px]">
                  {symbol.name}
                </span>
                <span className="block truncate text-[10px] text-[#586478]">
                  {symbol.preview}
                </span>
              </span>
              <span className="text-right text-[10px] text-[#586478]">
                {symbol.line}:{symbol.column}
              </span>
            </button>
          );
        })}
      </div>
    </CommandModal>
  );
}
