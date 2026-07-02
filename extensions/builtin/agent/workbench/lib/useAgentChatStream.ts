import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type AgentMessage } from "./agentConversation";
import {
  actionCanApplyEdits,
  parseEditProposal,
  stripEditProposalJson,
} from "./agentWorkbenchHelpers";

interface UseAgentChatStreamOptions {
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
}

// Streaming is intentionally isolated from the sidebar render tree because it
// is request-id driven state. A stale delta from a cancelled or superseded
// request must never write into the current conversation, so every event is
// matched against the active stream before it can mutate messages.
export function useAgentChatStream({ setMessages }: UseAgentChatStreamOptions) {
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<{ requestId: string; messageId: number } | null>(
    null,
  );

  useEffect(() => {
    return window.axon.onAiChatStreamEvent((event) => {
      const stream = streamRef.current;
      if (!stream || event.requestId !== stream.requestId) return;

      if (event.type === "delta" && event.delta) {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? { ...message, content: message.content + event.delta }
              : message,
          ),
        );
        return;
      }

      if (event.type === "status") {
        return;
      }

      if (event.type === "error") {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? {
                  ...message,
                  content:
                    message.content ||
                    event.error ||
                    "Axon Agent stream failed.",
                }
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
              ? {
                  ...message,
                  content:
                    message.content.trim() ||
                    "Request cancelled before Axon returned content.",
                }
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
            return {
              ...message,
              content: canApplyEdits
                ? strippedContent || message.content
                : strippedContent ||
                  "I should not propose file edits for this action. Ask a project question or choose an edit action when you want code changes.",
              result: editProposal && canApplyEdits
                ? {
                    success: true,
                    message: message.content,
                    modelLabel: "Axon model",
                    providerLabel: "Axon models",
                    editProposal,
                  }
                : message.result,
            };
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
