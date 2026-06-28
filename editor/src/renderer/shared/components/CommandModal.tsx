// Reusable modal shell used by command, search, picker, and outline surfaces.
// The shell owns the overlay and animation, while colors come from the active
// Axon theme variables so every empty, error, and search message inside these
// modals follows the selected theme instead of inheriting a hard-coded dark UI.
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
      className={`axon-modal-overlay fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-24 backdrop-blur-[2px] ${
        closing ? "axon-modal-overlay--leaving" : ""
      }`}
    >
      <div
        ref={ref}
        className={`axon-modal-panel ${width} flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.03] ${
          closing ? "axon-modal-panel--leaving" : ""
        }`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-4 py-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
              {title}
            </span>
            <Tooltip label="Close" side="left">
              <button
                onClick={requestClose}
                aria-label="Close"
                className="cursor-pointer text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:opacity-100"
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
