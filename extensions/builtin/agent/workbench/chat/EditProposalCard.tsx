/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FilePenLine,
} from "lucide-react";
import { type AiEditFileProposal } from "@axon-editor/shared/ai";

interface EditProposalCardProps {
  title: string;
  files: AiEditFileProposal[];
  onApply: (file: AiEditFileProposal) => void;
}

export default function EditProposalCard({
  title,
  files,
  onApply,
}: EditProposalCardProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());
  const [appliedFiles, setAppliedFiles] = useState<Set<number>>(new Set());

  const toggleFile = (index: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApply = (file: AiEditFileProposal, index: number) => {
    setAppliedFiles((prev) => new Set(prev).add(index));
    onApply(file);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-2">
        <FilePenLine
          size={12}
          className="shrink-0 text-[var(--axon-syntax-function)]"
        />
        <span className="text-[11px] font-medium text-[var(--axon-editor-foreground)]">
          {title}
        </span>
        <span className="ml-auto text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>

      {files.map((file, index) => {
        const isCollapsed = collapsedFiles.has(index);
        const isApplied = appliedFiles.has(index);
        const basename = file.path.split("/").pop() ?? file.path;

        return (
          <div
            key={file.path}
            className="border-b border-[var(--axon-panel-border)] last:border-b-0"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => toggleFile(index)}
                className="flex cursor-pointer items-center justify-center text-[var(--axon-editor-foreground)] opacity-40 hover:opacity-100"
                aria-label={isCollapsed ? "Expand file" : "Collapse file"}
              >
                {isCollapsed ? (
                  <ChevronRight size={11} />
                ) : (
                  <ChevronDown size={11} />
                )}
              </button>

              <span className="truncate text-[11px] font-medium text-[var(--axon-editor-foreground)]">
                {basename}
              </span>

              <span className="ml-auto truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-30">
                {file.path}
              </span>
            </div>

            {!isCollapsed && (
              <div className="px-3 pb-2 pl-6">
                {file.summary && (
                  <p className="mb-2 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-50">
                    {file.summary}
                  </p>
                )}

                {isApplied ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-500">
                    <Check size={10} />
                    Applied
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApply(file, index)}
                    className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--axon-syntax-function)] px-2.5 text-[11px] font-medium text-white opacity-90 transition-opacity hover:opacity-100"
                  >
                    <FilePenLine size={10} />
                    Apply
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
