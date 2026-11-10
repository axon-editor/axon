/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type AiActionId } from "@axon-editor/shared/ai/ai";
import {
  type AgentConversation,
  type AgentConversationState,
  type AgentMessage,
  activeAgentConversation,
  clearAgentConversation,
  conversationAction,
  emptyAgentConversationState,
  flushAllAgentConversations,
  loadAgentConversationState,
  saveActiveAgentConversation,
  selectAgentConversation,
  selectConversationAction,
  startAgentConversation,
  togglePinConversation,
} from "../../../lib/conversation";
import { saveAgentConversation } from "../../../lib/conversation/storage/saveAgentConversation";

interface Params {
  folderPath: string | null;
  messages: AgentMessage[];
  resumeConversationId: string | null;
  resumeRequested: boolean;
  activeStreamId: string | null;
  cancelActiveStream: () => Promise<void>;
  clearStream: () => void;
  onConversationReset: () => void;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
}

export interface AgentConversationSession {
  action: AiActionId;
  activeConversation: AgentConversation;
  activeConversationEmpty: boolean;
  clearConversationId: string | null;
  conversationPickerOpen: boolean;
  conversationReady: boolean;
  conversationState: AgentConversationState;
  confirmClearConversation: () => Promise<void>;
  selectAction: (action: AiActionId) => void;
  setBackendSessionId: (sessionId: string) => void;
  startNewConversation: () => Promise<void>;
  switchConversation: (conversationId: string) => Promise<void>;
  togglePin: (conversationId: string) => void;
  setAction: Dispatch<SetStateAction<AiActionId>>;
  setClearConversationId: Dispatch<SetStateAction<string | null>>;
  setConversationPickerOpen: Dispatch<SetStateAction<boolean>>;
}

// Conversation loading, saving, switching, and the resume handshake all read
// and write the same state machine. Keeping them in one hook stops the sidebar
// from juggling four refs and three effects just to render a transcript.
export function useAgentConversationSession({
  folderPath,
  messages,
  resumeConversationId,
  resumeRequested,
  activeStreamId,
  cancelActiveStream,
  clearStream,
  onConversationReset,
  setMessages,
}: Params): AgentConversationSession {
  const [conversationState, setConversationState] = useState(
    emptyAgentConversationState,
  );
  const [loadedFolderPath, setLoadedFolderPath] = useState<
    string | null | undefined
  >(undefined);
  const [action, setAction] = useState<AiActionId>("agent");
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const [clearConversationId, setClearConversationId] = useState<string | null>(
    null,
  );
  const resumeRequestHandledRef = useRef<string | null>(null);
  const conversationStateRef = useRef(conversationState);
  const savedBackendSessionRef = useRef<string | null>(null);

  // A folder prop can change a render before the load effect runs. Comparing
  // the loaded folder keeps the previous workspace's state from being saved or
  // cleared into the new workspace during that gap.
  const conversationReady =
    loadedFolderPath !== undefined && loadedFolderPath === folderPath;
  const activeConversation = activeAgentConversation(conversationState);
  const activeConversationEmpty = activeConversation.messages.length === 0;

  useEffect(() => {
    if (!conversationReady) return;
    const resumeToken = resumeRequested
      ? resumeConversationId || "__list__"
      : null;

    if (!resumeToken) {
      resumeRequestHandledRef.current = null;
      return;
    }

    if (resumeRequestHandledRef.current === resumeToken) return;
    resumeRequestHandledRef.current = resumeToken;

    if (!resumeConversationId) {
      // A bare `axon resume` means reopen the workspace and surface the saved
      // conversation list first. That keeps the CLI flow conversation-based
      // without forcing the user into a brand-new thread when they meant to
      // continue something already in progress.
      setConversationPickerOpen(true);
      return;
    }

    if (conversationState.activeId === resumeConversationId) return;
    if (
      !conversationState.conversations.some(
        (conversation) => conversation.id === resumeConversationId,
      )
    ) {
      setConversationPickerOpen(true);
      return;
    }

    setConversationState((current) => {
      const nextState = selectAgentConversation(
        folderPath,
        current,
        resumeConversationId,
      );
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    setConversationPickerOpen(false);
  }, [
    conversationReady,
    conversationState.activeId,
    conversationState.conversations,
    folderPath,
    resumeRequested,
    resumeConversationId,
    setMessages,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoadedFolderPath(undefined);
    resumeRequestHandledRef.current = null;
    setConversationPickerOpen(false);
    setClearConversationId(null);

    const pending = emptyAgentConversationState();
    const pendingActive = activeAgentConversation(pending);
    setConversationState(pending);
    setMessages(pendingActive.messages);
    setAction(conversationAction(pendingActive));

    void loadAgentConversationState(folderPath)
      .then((nextState) => {
        if (cancelled) return;
        const active = activeAgentConversation(nextState);
        setConversationState(nextState);
        setMessages(active.messages);
        setAction(conversationAction(active));
        setLoadedFolderPath(folderPath);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("failed to load agent conversations:", error);
        const fallback = emptyAgentConversationState();
        const active = activeAgentConversation(fallback);
        setConversationState(fallback);
        setMessages(active.messages);
        setAction(conversationAction(active));
        setLoadedFolderPath(folderPath);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath, setMessages]);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  useEffect(() => {
    if (!conversationReady) return;
    const current = conversationStateRef.current;
    const active = activeAgentConversation(current);
    if (active.messages === messages) return;
    setConversationState(
      saveActiveAgentConversation(folderPath, current, messages),
    );
  }, [messages, folderPath, conversationReady]);

  // The backend session id arrives as a stream event, not a message delta, so
  // the messages save effect may not see it until the next token. Persist it
  // once per active conversation so an immediate cancel cannot lose it.
  useEffect(() => {
    if (!conversationReady) return;
    const active = activeAgentConversation(conversationState);
    if (!active.backendSessionId) return;
    const key = `${conversationState.activeId}:${active.backendSessionId}`;
    if (savedBackendSessionRef.current === key) return;
    savedBackendSessionRef.current = key;
    saveAgentConversation(folderPath, active, conversationState.activeId);
  }, [conversationState, conversationReady, folderPath]);

  useEffect(() => {
    const flush = () => flushAllAgentConversations();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      // Streaming updates are debounced, so closing the panel has to push the
      // last pending conversation instead of waiting for the next token.
      flush();
    };
  }, []);

  const selectAction = useCallback(
    (nextAction: AiActionId) => {
      if (!conversationReady) return;
      setAction(nextAction);
      setConversationState((current) =>
        selectConversationAction(folderPath, current, nextAction),
      );
    },
    [conversationReady, folderPath],
  );

  const startNewConversation = useCallback(async () => {
    if (!conversationReady || activeConversationEmpty) return;
    if (activeStreamId) {
      await cancelActiveStream();
    }
    clearStream();
    setConversationState((current) => {
      const nextState = startAgentConversation(folderPath, current);
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    setConversationPickerOpen(false);
    onConversationReset();
  }, [
    conversationReady,
    activeConversationEmpty,
    activeStreamId,
    cancelActiveStream,
    clearStream,
    folderPath,
    onConversationReset,
    setMessages,
  ]);

  const switchConversation = useCallback(
    async (conversationId: string) => {
      if (!conversationReady) return;
      if (activeStreamId) {
        await cancelActiveStream();
      }
      setConversationState((current) => {
        const nextState = selectAgentConversation(
          folderPath,
          current,
          conversationId,
        );
        const active = activeAgentConversation(nextState);
        setMessages(active.messages);
        setAction(conversationAction(active));
        return nextState;
      });
      clearStream();
      setConversationPickerOpen(false);
    },
    [
      conversationReady,
      activeStreamId,
      cancelActiveStream,
      clearStream,
      folderPath,
      setMessages,
    ],
  );

  const confirmClearConversation = useCallback(async () => {
    if (!conversationReady || !clearConversationId) return;
    if (activeStreamId) {
      await cancelActiveStream();
    }
    setConversationState((current) => {
      const nextState = clearAgentConversation(
        folderPath,
        current,
        clearConversationId,
      );
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    clearStream();
    setClearConversationId(null);
    setConversationPickerOpen(false);
  }, [
    conversationReady,
    clearConversationId,
    activeStreamId,
    cancelActiveStream,
    clearStream,
    folderPath,
    setMessages,
  ]);

  const togglePin = useCallback(
    (conversationId: string) => {
      if (!conversationReady) return;
      setConversationState((current) =>
        togglePinConversation(folderPath, current, conversationId),
      );
    },
    [conversationReady, folderPath],
  );

  const setBackendSessionId = useCallback((sessionId: string) => {
    setConversationState((current) => {
      const nextState = {
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === current.activeId
            ? { ...conversation, backendSessionId: sessionId }
            : conversation,
        ),
      };
      conversationStateRef.current = nextState;
      return nextState;
    });
  }, []);

  return {
    action,
    activeConversation,
    activeConversationEmpty,
    clearConversationId,
    conversationPickerOpen,
    conversationReady,
    conversationState,
    confirmClearConversation,
    selectAction,
    setBackendSessionId,
    startNewConversation,
    switchConversation,
    togglePin,
    setAction,
    setClearConversationId,
    setConversationPickerOpen,
  };
}
