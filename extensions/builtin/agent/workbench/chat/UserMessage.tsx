/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import MessageHeader from "./MessageHeader";

interface UserMessageProps {
  content: string;
  messageId: number;
  copiedId: number | null;
  onCopied: (messageId: number) => void;
}

export default function UserMessage({
  content,
  messageId,
  copiedId,
  onCopied,
}: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%]">
        <MessageHeader
          role="user"
          messageId={messageId}
          copiedId={copiedId}
          onCopied={onCopied}
        />
        <div className="whitespace-pre-wrap rounded-xl rounded-tr-sm bg-[var(--axon-panel-overlay-hover)] px-3.5 py-2.5 text-[12px] leading-5 text-[var(--axon-editor-foreground)]">
          {content}
        </div>
      </div>
    </div>
  );
}
