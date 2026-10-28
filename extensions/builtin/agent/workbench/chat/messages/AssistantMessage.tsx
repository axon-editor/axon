/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiEditFileProposal } from "@axon-editor/shared/ai/ai";
import AgentThoughtBlock from "../content/AgentThoughtBlock";
import AgentToolCard from "../content/AgentToolCard";
import EditProposalCard from "../content/EditProposalCard";
import SmoothText from "../content/SmoothText";
import MessageHeader from "./MessageHeader";
import StreamingIndicator from "../indicators/StreamingIndicator";
import {
  type AgentTimelineEntry,
  type AgentToolCallState,
} from "../../lib/conversation";

interface AssistantMessageProps {
  content: string | null;
  editProposal?: { title: string; files: AiEditFileProposal[] };
  messageId: number;
  copiedId: number | null;
  toolCalls?: AgentToolCallState[];
  activity?: string;
  timeline?: AgentTimelineEntry[];
  reveal?: boolean;
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  onCopyContent: (content: string) => void;
  onRunTool?: (messageId: number, tool: AgentToolCallState) => void;
  onAllowTool?: (messageId: number, tool: AgentToolCallState) => void;
  onSkipTool?: (messageId: number, tool: AgentToolCallState) => void;
}

export default function AssistantMessage({
  content,
  editProposal,
  messageId,
  copiedId,
  toolCalls,
  activity,
  timeline,
  reveal,
  onApplyEdit,
  onCopied,
  onCopyContent,
  onRunTool,
  onAllowTool,
  onSkipTool,
}: AssistantMessageProps) {
  const entries: AgentTimelineEntry[] =
    timeline && timeline.length > 0
      ? timeline
      : [
          ...(content
            ? [
                {
                  id: `text-${messageId}`,
                  kind: "text" as const,
                  content,
                },
              ]
            : []),
          ...(toolCalls ?? []).map((tool) => ({
            id: `tool-${tool.id}`,
            kind: "tool" as const,
            tool,
          })),
        ];
  const lastStatusId = entries.reduce<string | null>(
    (last, entry) => (entry.kind === "status" ? entry.id : last),
    null,
  );

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
        {entries.map((entry) => {
          if (entry.kind === "text") {
            return (
              <SmoothText
                key={entry.id}
                content={entry.content}
                animateOnMount={Boolean(reveal)}
              />
            );
          }
          if (entry.kind === "thought") {
            return <AgentThoughtBlock key={entry.id} content={entry.content} />;
          }
          if (entry.kind === "tool") {
            return (
              <AgentToolCard
                key={entry.id}
                tool={entry.tool}
                onRun={(next) => onRunTool?.(messageId, next)}
                onAllow={(next) => onAllowTool?.(messageId, next)}
                onSkip={(next) => onSkipTool?.(messageId, next)}
              />
            );
          }
          return (
            <StreamingIndicator
              key={entry.id}
              label={entry.label}
              active={Boolean(activity) && entry.id === lastStatusId}
            />
          );
        })}
        {entries.length === 0 && <StreamingIndicator label={activity} />}

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
