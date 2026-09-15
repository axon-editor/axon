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
      className={`mb-1.5 flex items-center gap-2 ${
        isAssistant ? "justify-between" : "justify-end"
      }`}
    >
      {isAssistant && (
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--axon-syntax-function)] text-[9px] font-bold text-white">
            A
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
            Axon
          </span>
        </div>
      )}

      <div className="flex items-center gap-1">
        {!isAssistant ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
            You
          </span>
        ) : (
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-0 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 group-hover:opacity-45"
            aria-label="Copy response"
          >
            {copiedId === messageId ? (
              <Check size={12} />
            ) : (
              <Copy size={12} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
