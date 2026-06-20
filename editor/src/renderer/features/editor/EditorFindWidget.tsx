import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { type RefObject } from "react";
import Tooltip from "../../shared/components/Tooltip";

interface Props {
  findIndex: number;
  findInputRef: RefObject<HTMLInputElement | null>;
  findMatchCount: number;
  findQuery: string;
  onChangeQuery: (query: string) => void;
  onClose: () => void;
  onMoveSelection: (direction: 1 | -1) => void;
}

export default function EditorFindWidget({
  findIndex,
  findInputRef,
  findMatchCount,
  findQuery,
  onChangeQuery,
  onClose,
  onMoveSelection,
}: Props) {
  return (
    <div className="absolute right-4 top-3 z-20 flex h-8 items-center gap-1 rounded-md border border-[#2a3346] bg-[#10141d] px-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.35)]">
      <Search size={13} className="text-[#586478]" />
      <input
        ref={findInputRef}
        value={findQuery}
        onChange={(event) => onChangeQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter") {
            event.preventDefault();
            onMoveSelection(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder="find..."
        className="h-6 w-44 bg-transparent text-[12px] text-[#dce4f0] outline-none placeholder:text-[#465166]"
      />
      <span className="min-w-11 text-right text-[10px] text-[#586478]">
        {findQuery
          ? `${findMatchCount ? findIndex + 1 : 0}/${findMatchCount}`
          : "0/0"}
      </span>
      <Tooltip label="Previous match (Shift+Enter)" side="bottom">
        <button
          type="button"
          aria-label="Go to previous find match"
          onClick={() => onMoveSelection(-1)}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#1a2030] hover:text-white"
        >
          <ChevronUp size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Next match (Enter)" side="bottom">
        <button
          type="button"
          aria-label="Go to next find match"
          onClick={() => onMoveSelection(1)}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#1a2030] hover:text-white"
        >
          <ChevronDown size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Close find (Esc)" side="bottom">
        <button
          type="button"
          aria-label="Close find widget"
          onClick={onClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#1a2030] hover:text-white"
        >
          <X size={13} />
        </button>
      </Tooltip>
    </div>
  );
}
