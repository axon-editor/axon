/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memo, useMemo } from "react";
import { type AiEditFileProposal } from "@axon-editor/shared/ai/ai";
import AgentThoughtBlock from "../../../content/thought/components/AgentThoughtBlock";
import AgentToolCard from "../../../content/tools/components/AgentToolCard";
import EditProposalCard from "../../../content/edit/components/EditProposalCard";
import SmoothText from "../../../content/reveal/components/SmoothText";
import MessageHeader from "../../header/components/MessageHeader";
import StreamingIndicator from "../../../indicators/StreamingIndicator";
import {
  type AgentTimelineEntry,
  type AgentToolCallState,
} from "../../../../lib/conversation";

interface AssistantMessageProps {
  content: string | null;
  editProposal?: { title: string; files: AiEditFileProposal[] };
  messageId: number;
  copiedId: number | null;
  toolCalls?: AgentToolCallState[];
  activity?: string;
  timeline?: AgentTimelineEntry[];
  reveal?: boolean;
  streaming?: boolean;
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  onCopyContent: (content: string) => void;
  onOpenLink?: (href: string) => void;
  onOpenFile?: (path: string) => void;
  onRunTool?: (messageId: number, tool: AgentToolCallState) => void;
  onAllowTool?: (messageId: number, tool: AgentToolCallState) => void;
  onSkipTool?: (messageId: number, tool: AgentToolCallState) => void;
}

// Rebuilding the timeline on every streamed token forced every tool card and
// text block to receive new objects, which made React reconcile the whole
// transcript. The memo below is only useful if the derived entries stay stable
// for unchanged messages, so both live together in this component.
function AssistantMessage({
  content,
  editProposal,
  messageId,
  copiedId,
  toolCalls,
  activity,
  timeline,
  reveal,
  streaming,
  onApplyEdit,
  onCopied,
  onCopyContent,
  onOpenLink,
  onOpenFile,
  onRunTool,
  onAllowTool,
  onSkipTool,
}: AssistantMessageProps) {
  const { entries, lastStatusId, lastEntryId } = useMemo(() => {
    const nextEntries: AgentTimelineEntry[] =
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
    const nextLastStatusId = nextEntries.reduce<string | null>(
      (last, entry) => (entry.kind === "status" ? entry.id : last),
      null,
    );
    return {
      entries: nextEntries,
      lastStatusId: nextLastStatusId,
      lastEntryId: nextEntries[nextEntries.length - 1]?.id ?? null,
    };
  }, [content, messageId, timeline, toolCalls]);

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
                onOpenLink={onOpenLink}
              />
            );
          }
          if (entry.kind === "thought") {
            return (
              <AgentThoughtBlock
                key={entry.id}
                content={entry.content}
                active={Boolean(streaming) && entry.id === lastEntryId}
                onOpenLink={onOpenLink}
              />
            );
          }
          if (entry.kind === "tool") {
            return (
              <AgentToolCard
                key={entry.id}
                tool={entry.tool}
                onOpenFile={onOpenFile}
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

export default memo(AssistantMessage);
