/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type AgentMessage } from "../conversation";
import {
  appendAgentStatus,
  appendAgentText,
  appendAgentThought,
  finalizeAgentTimeline,
} from "../conversation/timeline";
import { upsertAgentTool } from "../conversation/timeline/upsert/upsertAgentTool";
import {
  actionCanApplyEdits,
  parseEditProposal,
  stripEditProposalJson,
} from "../helpers/agentWorkbenchHelpers";

interface UseAgentChatStreamOptions {
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  onDirectoryCreated?: (path: string) => void;
  onFileWritten?: (path: string) => void;
}

// Streaming is intentionally isolated from the sidebar render tree because it
// is request-id driven state. A stale delta from a cancelled or superseded
// request must never write into the current conversation, so every event is
// matched against the active stream before it can mutate messages.
export function useAgentChatStream({
  setMessages,
  onDirectoryCreated,
  onFileWritten,
}: UseAgentChatStreamOptions) {
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<{ requestId: string; messageId: number } | null>(
    null,
  );
  const onDirectoryCreatedRef = useRef(onDirectoryCreated);
  const onFileWrittenRef = useRef(onFileWritten);

  // The layout passes refresh callbacks that change identity with workspace
  // state. Keeping them in refs avoids tearing down and resubscribing the IPC
  // listener on every render just to call the latest callback.
  useEffect(() => {
    onDirectoryCreatedRef.current = onDirectoryCreated;
  }, [onDirectoryCreated]);

  useEffect(() => {
    onFileWrittenRef.current = onFileWritten;
  }, [onFileWritten]);

  useEffect(() => {
    return window.axon.onAiChatStreamEvent((event) => {
      const stream = streamRef.current;
      if (!stream || event.requestId !== stream.requestId) return;

      const thought = event.thought;
      if (event.type === "thought" && thought) {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? appendAgentThought(message, thought)
              : message,
          ),
        );
        return;
      }

      const delta = event.delta;
      if (event.type === "delta" && delta) {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? appendAgentText(message, delta)
              : message,
          ),
        );
        return;
      }

      if (event.type === "status") {
        const status = event.status?.trim();
        if (!status) return;
        // Status lines live in the timeline so "Thinking..." and "Running
        // read_file..." stay next to the tool cards they describe instead of
        // being replaced by whatever happened last.
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? appendAgentStatus(message, status)
              : message,
          ),
        );
        return;
      }

      if (event.type === "tool-proposed" && event.tool) {
        const tool = event.tool;
        setMessages((current) =>
          current.map((item) =>
            item.id === stream.messageId
              ? upsertAgentTool(item, { ...tool, status: "pending" })
              : item,
          ),
        );
        return;
      }

      if (event.type === "tool-started" && event.tool) {
        const tool = event.tool;
        setMessages((current) =>
          current.map((item) =>
            item.id === stream.messageId
              ? upsertAgentTool(item, { ...tool, status: "running" })
              : item,
          ),
        );
        return;
      }

      if (event.type === "tool-result" && event.tool) {
        const result = event.toolResult;
        const tool = event.tool;
        setMessages((current) =>
          current.map((item) =>
            item.id === stream.messageId
              ? upsertAgentTool(item, {
                  ...tool,
                  status: result?.rejected
                    ? "rejected"
                    : result?.ok
                      ? "done"
                      : "error",
                  ...(result?.message !== undefined
                    ? { message: result.message }
                    : {}),
                  ...(result?.result !== undefined
                    ? { result: result.result }
                    : {}),
                })
              : item,
          ),
        );
        if (
          event.tool.name === "write_file" &&
          result?.ok &&
          !result.rejected &&
          result.result
        ) {
          onFileWrittenRef.current?.(result.result);
        }
        if (
          event.tool.name === "create_directory" &&
          result?.ok &&
          !result.rejected &&
          result.result
        ) {
          onDirectoryCreatedRef.current?.(result.result);
        }
        const argumentPath = [
          tool.arguments.path,
          tool.arguments.filePath,
          tool.arguments.file,
        ].find(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        );
        if (
          argumentPath &&
          result?.ok &&
          !result.rejected &&
          (event.tool.name === "write" ||
            event.tool.name === "edit" ||
            event.tool.name === "patch")
        ) {
          onFileWrittenRef.current?.(argumentPath);
        }
        return;
      }

      if (event.type === "error") {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? finalizeAgentTimeline(
                  message,
                  message.content ||
                    event.error ||
                    "Axon Agent stream failed.",
                )
              : message,
          ),
        );
        streamRef.current = null;
        setActiveStreamId(null);
        setBusy(false);
        return;
      }

      if (event.type === "cancelled") {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? finalizeAgentTimeline(
                  message,
                  message.content.trim() ||
                    "Request cancelled before Axon returned content.",
                )
              : message,
          ),
        );
        streamRef.current = null;
        setActiveStreamId(null);
        setBusy(false);
        return;
      }

      if (event.type === "done") {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== stream.messageId) return message;

            const editProposal = parseEditProposal(message.content);
            const canApplyEdits = actionCanApplyEdits(message.action);
            const strippedContent = stripEditProposalJson(message.content);
            const content = canApplyEdits
              ? strippedContent || message.content
              : strippedContent ||
                "I should not propose file edits for this action. Ask a project question or choose an edit action when you want code changes.";
            const result =
              editProposal && canApplyEdits
                ? {
                    success: true,
                    message: message.content,
                    modelLabel: "Axon model",
                    providerLabel: "Axon models",
                    editProposal,
                  }
                : message.result;
            return finalizeAgentTimeline(
              { ...message, result },
              content,
            );
          }),
        );
        streamRef.current = null;
        setActiveStreamId(null);
        setBusy(false);
      }
    });
  }, [setMessages]);

  const beginStream = useCallback((requestId: string, messageId: number) => {
    streamRef.current = {
      requestId,
      messageId,
    };
    setActiveStreamId(requestId);
  }, []);

  const clearStream = useCallback(() => {
    streamRef.current = null;
    setActiveStreamId(null);
    setBusy(false);
  }, []);

  const cancelActiveStream = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    await window.axon.cancelAiChatStream(stream.requestId);
  }, []);

  return {
    activeStreamId,
    beginStream,
    busy,
    cancelActiveStream,
    clearStream,
    setBusy,
  };
}
