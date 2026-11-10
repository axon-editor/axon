/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Dispatch, type SetStateAction } from "react";
import {
  type AiActionId,
  type AiModelInfo,
  type AiUiState,
} from "@axon-editor/shared/ai/ai";
import { defaultPromptForAction } from "../../../lib/actions/agentActions";
import {
  type AgentMessage,
  isGreetingPrompt,
} from "../../../lib/conversation";
import { conversationContext } from "../../../lib/conversation/context";
import {
  type AgentWorkbenchContextInput,
  buildContextFile,
  collectGitDiffForAgent,
} from "../../../lib/helpers/agentWorkbenchHelpers";

interface Params {
  action: AiActionId;
  busy: boolean;
  canChat: boolean;
  context: AgentWorkbenchContextInput;
  conversationId: string;
  conversationReady: boolean;
  folderPath: string | null;
  messages: AgentMessage[];
  prompt: string;
  selectedModel: string;
  selectedModelInfo?: AiModelInfo;
  uiState: AiUiState;
  beginStream: (requestId: string, messageId: number) => void;
  pinToBottom: () => void;
  selectAction: (action: AiActionId) => void;
  setBusy: (busy: boolean) => void;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  setPrompt: Dispatch<SetStateAction<string>>;
}

// Sending owns the message ids, the greeting shortcut, the Git diff context,
// and the stream handshake. Keeping it out of the sidebar component means the
// surface only wires state to UI instead of also implementing the send flow.
export function useAgentSendMessage({
  action,
  busy,
  canChat,
  context,
  conversationId,
  conversationReady,
  folderPath,
  messages,
  prompt,
  selectedModel,
  selectedModelInfo,
  uiState,
  beginStream,
  pinToBottom,
  selectAction,
  setBusy,
  setMessages,
  setPrompt,
}: Params) {
  return async (nextAction = action, nextPrompt = prompt) => {
    const finalPrompt = nextPrompt.trim() || defaultPromptForAction(nextAction);
    if (!finalPrompt || busy || !canChat || !conversationReady) return;

    selectAction(nextAction);

    const userMessage: AgentMessage = {
      id: Date.now(),
      role: "user",
      content: finalPrompt,
    };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setBusy(true);
    // Sending is an explicit request for the latest message, even if the user
    // had scrolled up to re-read something before composing.
    pinToBottom();

    if (
      messages.length === 0 &&
      (nextAction === "agent" || nextAction === "ask") &&
      isGreetingPrompt(finalPrompt)
    ) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "What are we working on in Axon today?",
          action: nextAction,
        },
      ]);
      setBusy(false);
      return;
    }

    const assistantMessageId = Date.now() + 1;
    setMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        action: nextAction,
      },
    ]);

    const gitDiff =
      folderPath &&
      (nextAction === "review-git-diff" ||
        nextAction === "draft-commit-message")
        ? await collectGitDiffForAgent(folderPath, context.gitChanges)
        : undefined;

    const started = await window.axon.runAiChatStream({
      action: nextAction,
      prompt: finalPrompt,
      folderPath,
      activeFilePath: context.activeFilePath,
      files: buildContextFile(context),
      diagnostics: context.diagnostics,
      gitChanges: context.gitChanges,
      conversation: conversationContext(messages),
      conversationId,
      gitDiff,
      model: selectedModel,
      ...(selectedModelInfo?.backend === "opencode"
        ? {
            backend: "opencode" as const,
            providerID: selectedModelInfo.providerID,
            modelID: selectedModelInfo.modelID,
          }
        : {}),
      uiState,
    });

    if (!started.success) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: started.message ?? "Axon Agent could not start.",
              }
            : message,
        ),
      );
      setBusy(false);
      return;
    }

    beginStream(started.requestId, assistantMessageId);
  };
}
