/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiEditFileProposal } from "@axon-editor/shared/ai";
import { type AgentMessage } from "../lib/agentConversation";
import AssistantMessage from "./AssistantMessage";
import UserMessage from "./UserMessage";

interface Props {
  copiedId: number | null;
  messages: AgentMessage[];
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
}

export default function AgentMessageList(props: Props) {
  const handleCopyContent = (content: string) => {
    void window.axon.copyText(content);
  };

  return (
    <div className="space-y-5">
      {props.messages.map((message) =>
        message.role === "user" ? (
          <UserMessage
            key={message.id}
            content={message.content}
            messageId={message.id}
            copiedId={props.copiedId}
            onCopied={props.onCopied}
          />
        ) : (
          <AssistantMessage
            key={message.id}
            content={message.content || null}
            editProposal={message.result?.editProposal}
            messageId={message.id}
            copiedId={props.copiedId}
            onApplyEdit={props.onApplyEdit}
            onCopied={props.onCopied}
            onCopyContent={handleCopyContent}
          />
        ),
      )}
      <div ref={props.scrollAnchorRef} />
    </div>
  );
}
