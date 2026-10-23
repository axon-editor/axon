/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The title bar is the only safe drag surface on a modal. Content can contain
// inputs, trees, and scrolling regions, so the shell hands the drag handler to
// this header instead of listening on the whole panel.
import { X } from "lucide-react";
import Tooltip from "../../primitives/Tooltip";
import type { DraggableHandleProps } from "../drag/useDraggableModal";

interface Props {
  title: string;
  onClose: () => void;
  draggable?: boolean;
  dragHandleProps?: DraggableHandleProps;
}

export default function ModalHeader({
  title,
  onClose,
  draggable = false,
  dragHandleProps,
}: Props) {
  return (
    <div
      className={`flex select-none items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-4 py-3 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      data-modal-drag-handle={draggable ? "true" : undefined}
      {...dragHandleProps}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
        {title}
      </span>
      <Tooltip label="Close" side="left">
        <button
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:opacity-100"
        >
          <X size={13} />
        </button>
      </Tooltip>
    </div>
  );
}
