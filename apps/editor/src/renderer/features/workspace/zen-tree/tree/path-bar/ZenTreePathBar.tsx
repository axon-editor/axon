/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FolderTree } from "lucide-react";

interface Props {
  rootPath: string | null;
}

export default function ZenTreePathBar({ rootPath }: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-4 py-2">
      <FolderTree
        size={12}
        className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45"
      />
      <span className="min-w-0 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
        {rootPath ?? "No workspace open"}
      </span>
      <span className="ml-auto shrink-0 rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-40">
        read only
      </span>
    </div>
  );
}
