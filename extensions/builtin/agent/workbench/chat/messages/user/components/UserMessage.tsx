/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memo } from "react";
import MessageHeader from "../../header/components/MessageHeader";

interface UserMessageProps {
  content: string;
  messageId: number;
  copiedId: number | null;
  onCopied: (messageId: number) => void;
}

function UserMessage({
  content,
  messageId,
  copiedId,
  onCopied,
}: UserMessageProps) {
  return (
    <div className="flex justify-end" data-message-id={messageId}>
      <div className="max-w-[85%]">
        <MessageHeader
          role="user"
          messageId={messageId}
          copiedId={copiedId}
          onCopied={onCopied}
        />
        <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--axon-syntax-function)]/10 px-3.5 py-2.5 text-[13px] leading-5 text-[var(--axon-editor-foreground)]">
          {content}
        </div>
      </div>
    </div>
  );
}

export default memo(UserMessage);
