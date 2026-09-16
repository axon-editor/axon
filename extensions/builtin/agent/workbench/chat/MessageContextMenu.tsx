/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef } from "react";
import { Copy, Pencil, RefreshCw } from "lucide-react";

interface MessageContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
  canEdit: boolean;
}

export default function MessageContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onRetry,
  onEdit,
  canEdit,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[160px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-xl shadow-black/50"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        onClick={() => { onCopy(); onClose(); }}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
      >
        <Copy size={12} />
        Copy
      </button>
      {onRetry && (
        <button
          type="button"
          onClick={() => { onRetry(); onClose(); }}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
      {canEdit && onEdit && (
        <button
          type="button"
          onClick={() => { onEdit(); onClose(); }}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
        >
          <Pencil size={12} />
          Edit
        </button>
      )}
    </div>
  );
}
