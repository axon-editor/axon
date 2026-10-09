/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Check, Copy } from "lucide-react";

interface MessageHeaderProps {
  role: "user" | "assistant";
  copiedId: number | null;
  messageId: number;
  onCopied: (messageId: number) => void;
}

export default function MessageHeader({
  role,
  copiedId,
  messageId,
  onCopied,
}: MessageHeaderProps) {
  const isAssistant = role === "assistant";

  const handleCopy = () => {
    onCopied(messageId);
  };

  return (
    <div
      className={`mb-1 flex items-center gap-1.5 ${
        isAssistant ? "justify-between" : "justify-end"
      }`}
    >
      {isAssistant && (
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--axon-syntax-function)]/15 text-[9px] font-bold text-[var(--axon-syntax-function)]">
            A
          </span>
          <span className="text-[11px] font-medium text-[var(--axon-editor-foreground)] opacity-50">
            Axon
          </span>
        </div>
      )}

      <div className="flex items-center gap-0.5">
        {!isAssistant && (
          <span className="text-[11px] font-medium text-[var(--axon-editor-foreground)] opacity-40">
            You
          </span>
        )}
        {isAssistant && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-0 transition-opacity hover:bg-[var(--axon-panel-overlay-hover)] group-hover/assistant:opacity-40 hover:!opacity-100"
            aria-label="Copy response"
          >
            {copiedId === messageId ? (
              <Check size={11} />
            ) : (
              <Copy size={11} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
