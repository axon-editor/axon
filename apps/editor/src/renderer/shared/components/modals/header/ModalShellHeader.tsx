/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Custom headers let titleless modals keep their own search row while still
// borrowing the shell's drag behavior. The wrapper only owns the drag surface;
// the caller owns everything inside it.
import type { ReactNode } from "react";
import ModalHeader from "./ModalHeader";
import type { DraggableHandleProps } from "../drag/useDraggableModal";

interface Props {
  title?: string;
  header?: ReactNode;
  onClose: () => void;
  draggable: boolean;
  dragHandleProps?: DraggableHandleProps;
}

export default function ModalShellHeader({
  title,
  header,
  onClose,
  draggable,
  dragHandleProps,
}: Props) {
  if (header) {
    return (
      <div
        className={
          draggable ? "cursor-grab active:cursor-grabbing" : undefined
        }
        data-modal-drag-handle={draggable ? "true" : undefined}
        {...(draggable ? dragHandleProps : undefined)}
      >
        {header}
      </div>
    );
  }

  if (!title) return null;

  return (
    <ModalHeader
      title={title}
      onClose={onClose}
      draggable={draggable}
      dragHandleProps={draggable ? dragHandleProps : undefined}
    />
  );
}
