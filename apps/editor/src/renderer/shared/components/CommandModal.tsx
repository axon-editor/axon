/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import {
  markAxonPerformance,
  measureAxonPerformance,
} from "../lib/performanceMarks";

function getModalPerformanceName(title: string | undefined) {
  return (title ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

interface Props {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  bodyClassName?: string;
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
  animate = true,
  closeDelayMs = 170,
  overlayClassName = "",
  panelStyle,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  const modalName = title ?? "untitled";
  const modalPerformanceName = getModalPerformanceName(title);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    markAxonPerformance(`axon.modal.${modalPerformanceName}.close.request`, {
      modal: modalName,
    });

    if (!animate || closeDelayMs <= 0) {
      onCloseRef.current();
      return;
    }

    setClosing(true);

    // The modal has to stay mounted long enough for the leave animation to
    // play, otherwise React removes the overlay immediately and close feels
    // abrupt even when the enter motion is polished. The timer is deliberately
    // not owned by the document listener effect below: that effect re-runs
    // whenever the title or the close callback identity changes, and a cleanup
    // that cleared this timer would strand a full-window fixed overlay on top
    // of the workbench with nothing left to dismiss it. A separate unmount
    // effect owns the timer so only real teardown can cancel the close.
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, closeDelayMs);
  }, [animate, closeDelayMs, modalName, modalPerformanceName]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    markAxonPerformance(`axon.modal.${modalPerformanceName}.open`, {
      modal: modalName,
    });
    measureAxonPerformance(
      `axon.modal.${modalPerformanceName}.fromRendererBoot`,
      "axon.renderer.boot.start",
      `axon.modal.${modalPerformanceName}.open`,
    );

    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (ref.current && !ref.current.contains(target)) requestClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
      markAxonPerformance(`axon.modal.${modalPerformanceName}.unmount`, {
        modal: modalName,
      });
    };
  }, [modalName, modalPerformanceName, requestClose]);

  return (
    <div
      className={`axon-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4 py-6 ${overlayClassName} ${
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
