/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function ModalEmptyState({
  icon: Icon,
  title,
  description,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Icon
        size={20}
        className="text-[var(--axon-editor-foreground)] opacity-25"
      />
      <p className="text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
        {title}
      </p>
      {description && (
        <p className="text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
          {description}
        </p>
      )}
    </div>
  );
}
