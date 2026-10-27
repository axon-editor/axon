/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Files, FolderTree, GitBranch, X } from "lucide-react";
import { getPathBasename, getPathParent } from "../../shared/zenTreePath";

interface Props {
  rootPath: string | null;
  fileCount: number;
  gitChangeCount: number;
  onClose: () => void;
}

export default function ZenTreeHeader({
  rootPath,
  fileCount,
  gitChangeCount,
  onClose,
}: Props) {
  const workspaceName = getPathBasename(rootPath);
  const parentPath = getPathParent(rootPath);
  const fileCountLabel = `${fileCount.toLocaleString()} ${
    fileCount === 1 ? "file" : "files"
  }`;
  const gitChangeLabel = `${gitChangeCount} ${
    gitChangeCount === 1 ? "change" : "changes"
  }`;

  return (
    <header className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <FolderTree size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--axon-editor-foreground)]">
              Workspace tree
            </span>
            <span className="shrink-0 rounded-full border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.16em] text-[var(--axon-editor-foreground)] opacity-45">
              read only
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--axon-editor-foreground)]">
            <span className="truncate font-medium opacity-70">
              {workspaceName || "No workspace open"}
            </span>
            {parentPath && (
              <>
                <span className="shrink-0 opacity-25">·</span>
                <span className="truncate font-mono opacity-35">
                  {parentPath}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {fileCount > 0 && (
            <span className="hidden items-center gap-1 rounded-full border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[9px] text-[var(--axon-editor-foreground)] opacity-55 sm:flex">
              <Files size={10} />
              {fileCountLabel}
            </span>
          )}
          {gitChangeCount > 0 && (
            <span className="hidden items-center gap-1 rounded-full border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[9px] text-[var(--axon-editor-foreground)] opacity-55 md:flex">
              <GitBranch size={10} />
              {gitChangeLabel}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace tree"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
