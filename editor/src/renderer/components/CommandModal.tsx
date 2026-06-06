// Reusable modal shell used by CommandPalette, FolderPicker, and OpenFile.
// Renders a centered overlay with a consistent dark style.
// Children render inside the modal body.
// Closes on outside click or Escape key.
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Tooltip from "./Tooltip";

interface Props {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  bodyClassName?: string;
}

export default function CommandModal({
  title,
  onClose,
  children,
  width = "w-[560px]",
  bodyClassName = "min-h-0 overflow-auto",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);

    // The modal has to stay mounted long enough for the leave animation to
    // play. Without this small handoff React removes the overlay immediately,
    // which makes close feel abrupt even when the enter motion is polished.
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 170);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) requestClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, [requestClose]);

  return (
    <div
      className={`axon-modal-overlay fixed inset-0 z-50 flex items-start justify-center bg-[#05070c]/35 px-4 pt-24 backdrop-blur-[2px] ${
        closing ? "axon-modal-overlay--leaving" : ""
      }`}
    >
      <div
        ref={ref}
        className={`axon-modal-panel ${width} flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-[#2a3042] bg-[#11141d] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.03] ${
          closing ? "axon-modal-panel--leaving" : ""
        }`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[#222838] bg-[#141824] px-4 py-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[#9aa4b8]">
              {title}
            </span>
            <Tooltip label="Close" side="left">
              <button
                onClick={requestClose}
                aria-label="Close"
                className="text-[#586478] hover:text-white transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
