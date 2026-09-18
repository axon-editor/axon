/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiEditFileProposal } from "@axon-editor/shared/ai";
import AssistantMarkdown from "./AssistantMarkdown";
import EditProposalCard from "./EditProposalCard";
import MessageHeader from "./MessageHeader";
import StreamingIndicator from "./StreamingIndicator";

interface AssistantMessageProps {
  content: string | null;
  editProposal?: { title: string; files: AiEditFileProposal[] };
  messageId: number;
  copiedId: number | null;
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  onCopyContent: (content: string) => void;
}

export default function AssistantMessage({
  content,
  editProposal,
  messageId,
  copiedId,
  onApplyEdit,
  onCopied,
  onCopyContent,
}: AssistantMessageProps) {
  return (
    <div className="group/assistant flex flex-col" data-message-id={messageId}>
      <MessageHeader
        role="assistant"
        messageId={messageId}
        copiedId={copiedId}
        onCopied={() => {
          if (content) {
            onCopyContent(content);
          }
          onCopied(messageId);
        }}
      />

      <div className="w-full">
        {content ? (
          <AssistantMarkdown content={content} />
        ) : (
          <StreamingIndicator />
        )}

        {editProposal && (
          <EditProposalCard
            title={editProposal.title}
            files={editProposal.files}
            onApply={onApplyEdit}
          />
        )}
      </div>
    </div>
  );
}
