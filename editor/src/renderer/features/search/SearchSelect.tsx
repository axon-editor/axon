// SearchSelect replaces browser-native dropdown controls so Axon can keep
// keyboard behavior, filtering, styling, and future option metadata consistent
// across the app. It supports mouse selection, type-to-filter, ArrowUp /
// ArrowDown movement, Enter selection, and Escape close.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SearchSelectItem<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface Props<T extends string> {
  value: T;
  items: SearchSelectItem<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  placeholder?: string;
  emptyLabel?: string;
}

export default function SearchSelect<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  placeholder = "Search...",
  emptyLabel = "No matches",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((item) => item.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((item) => {
      const haystack = `${item.label} ${item.value} ${item.description ?? ""}`;
      return haystack.toLowerCase().includes(normalizedQuery);
    });
  }, [items, normalizedQuery]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlightedIndex(0);
  };

  const selectItem = (item: SearchSelectItem<T>) => {
    onChange(item.value);
    close();
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    const item = listRef.current?.children[highlightedIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) =>
        Math.min(index + 1, filteredItems.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = filteredItems[highlightedIndex];
      if (item) selectItem(item);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        className="flex h-8 w-full cursor-pointer items-center justify-between rounded border border-[#222838] bg-[#0e1018] px-2 text-left text-[12px] text-[#c8d0e0] outline-none transition-colors hover:border-[#2a3346] focus:border-[#80c8e0]"
      >
        <span className="truncate">{selectedItem?.label ?? placeholder}</span>
        <ChevronDown
          size={14}
          className={`ml-2 shrink-0 text-[#586478] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="axon-popover absolute left-0 right-0 top-9 z-[120] overflow-hidden rounded-md border border-[#2a3346] bg-[#10131a] shadow-2xl">
          <div className="flex h-8 items-center gap-2 border-b border-[#202838] px-2">
            <Search size={13} className="shrink-0 text-[#586478]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-[#dce4f0] outline-none placeholder:text-[#586478]"
            />
          </div>

          <div ref={listRef} className="max-h-52 overflow-y-auto py-1">
            {filteredItems.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[#586478]">
                {emptyLabel}
              </div>
            ) : (
              filteredItems.map((item, index) => {
                const selected = item.value === value;
                const highlighted = index === highlightedIndex;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectItem(item)}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                      highlighted
                        ? "bg-[#1b2030] text-white"
                        : "text-[#c8d0e0] hover:bg-[#151923]"
                    }`}
                  >
                    <Check
                      size={13}
                      className={`shrink-0 ${
                        selected ? "text-[#80c8e0]" : "text-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
