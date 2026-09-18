/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import { type AiEditFileProposal } from "@axon-editor/shared/ai";
import { type AgentMessage } from "../lib/agentConversation";
import AssistantMessage from "./AssistantMessage";
import MessageContextMenu from "./MessageContextMenu";
import UserMessage from "./UserMessage";

interface Props {
  copiedId: number | null;
  messages: AgentMessage[];
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  onRetry?: (messageId: number) => void;
  onEdit?: (messageId: number, content: string) => void;
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
}

export default function AgentMessageList(props: Props) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    message: AgentMessage;
  } | null>(null);

  const handleCopyContent = (content: string) => {
    void window.axon.copyText(content);
  };

  const handleContextMenu = (event: React.MouseEvent, message: AgentMessage) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, message });
  };

  return (
    <div
      className="space-y-4"
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        const messageEl = target.closest("[data-message-id]");
        if (messageEl) {
          const messageId = Number(messageEl.getAttribute("data-message-id"));
          const message = props.messages.find((m) => m.id === messageId);
          if (message) {
            handleContextMenu(event, message);
          }
        }
      }}
    >
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

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={() => handleCopyContent(contextMenu.message.content)}
          onRetry={
            contextMenu.message.role === "assistant" && props.onRetry
              ? () => props.onRetry!(contextMenu.message.id)
              : undefined
          }
          onEdit={
            contextMenu.message.role === "user" && props.onEdit
              ? () => props.onEdit!(contextMenu.message.id, contextMenu.message.content)
              : undefined
          }
          canEdit={contextMenu.message.role === "user"}
        />
      )}
    </div>
  );
}
