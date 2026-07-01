// Reusable modal shell used by command, search, picker, and outline surfaces.
// The shell owns the overlay and animation, while colors come from the active
// Axon theme variables so every empty, error, and search message inside these
// modals follows the selected theme instead of inheriting a hard-coded dark UI.
// Closes on outside click or Escape key.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { X } from "lucide-react";
import Tooltip from "./Tooltip";

interface Props {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  bodyClassName?: string;
  blurOverlay?: boolean;
  animate?: boolean;
  closeDelayMs?: number;
  overlayClassName?: string;
  panelStyle?: CSSProperties;
}

export default function CommandModal({
  title,
  onClose,
  children,
  width = "w-[560px]",
  bodyClassName = "min-h-0 overflow-auto",
  blurOverlay = true,
  animate = true,
  closeDelayMs = 170,
  overlayClassName = "bg-black/35",
  panelStyle,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    if (!animate || closeDelayMs <= 0) {
      onCloseRef.current();
      return;
    }

    setClosing(true);

    // The modal has to stay mounted long enough for the leave animation to
    // play. Without this small handoff React removes the overlay immediately,
    // which makes close feel abrupt even when the enter motion is polished.
    // I call the latest onClose through a ref because search and command
    // surfaces often update while they are closing. If this timeout is tied to
    // a callback identity from the previous render, React can run the cleanup,
    // clear the timer, and leave an invisible fixed overlay mounted forever.
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, closeDelayMs);
  }, [animate, closeDelayMs]);

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
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-6 ${
        animate ? "axon-modal-overlay" : ""
      } ${overlayClassName} ${
        blurOverlay ? "backdrop-blur-[2px]" : ""
      } ${
        closing && animate ? "axon-modal-overlay--leaving" : ""
      }`}
    >
      <div
        ref={ref}
        className={`${animate ? "axon-modal-panel" : ""} ${width} flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.03] ${
          closing && animate ? "axon-modal-panel--leaving" : ""
        }`}
        style={panelStyle}
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
