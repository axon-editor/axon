import {
  type AiActionId,
  type AiChatResult,
  type AiConversationMessage,
} from "@axon-editor/shared/ai";

export interface AgentMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  action?: AiActionId;
  result?: AiChatResult;
}

export interface AgentConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
}

export interface AgentConversationState {
  activeId: string;
  conversations: AgentConversation[];
}

const legacyConversationPrefix = "axon:agentConversation:";
const conversationPrefix = "axon:agentConversations:";

function conversationKey(folderPath: string | null) {
  return `${conversationPrefix}${folderPath ?? "no-workspace"}`;
}

function legacyConversationKey(folderPath: string | null) {
  return `${legacyConversationPrefix}${folderPath ?? "no-workspace"}`;
}

function newConversation(messages: AgentMessage[] = []): AgentConversation {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: conversationTitle(messages),
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

function validMessages(value: unknown): AgentMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (message): message is AgentMessage =>
        typeof message === "object" &&
        message !== null &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .slice(-40);
}

function conversationTitle(messages: AgentMessage[]) {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  const title = firstUserMessage?.content.trim() || "New conversation";
  return title.length > 48 ? `${title.slice(0, 45)}...` : title;
}

function normalizeState(value: unknown): AgentConversationState | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AgentConversationState>;
  if (typeof candidate.activeId !== "string" || !Array.isArray(candidate.conversations)) {
    return null;
  }
  const conversations = candidate.conversations
    .filter(
      (conversation): conversation is AgentConversation =>
        typeof conversation === "object" &&
        conversation !== null &&
        typeof conversation.id === "string",
    )
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title || conversationTitle(validMessages(conversation.messages)),
      createdAt: conversation.createdAt || Date.now(),
      updatedAt: conversation.updatedAt || Date.now(),
      messages: validMessages(conversation.messages),
    }))
    .slice(-30);
  if (!conversations.length) return null;
  return {
    activeId: conversations.some((conversation) => conversation.id === candidate.activeId)
      ? candidate.activeId
      : conversations[conversations.length - 1].id,
    conversations,
  };
}

export function loadAgentConversationState(folderPath: string | null): AgentConversationState {
  try {
    const parsed = JSON.parse(localStorage.getItem(conversationKey(folderPath)) ?? "null");
    const normalized = normalizeState(parsed);
    if (normalized) return normalized;
  } catch {
    // Fall through to legacy migration or a fresh empty conversation.
  }

  try {
    const legacyMessages = validMessages(
      JSON.parse(localStorage.getItem(legacyConversationKey(folderPath)) ?? "[]"),
    );
    if (legacyMessages.length) {
      const conversation = newConversation(legacyMessages);
      return {
        activeId: conversation.id,
        conversations: [conversation],
      };
    }
  } catch {
    // Ignore broken legacy data; a new empty conversation is safer than a crash.
  }

  const conversation = newConversation();
  return {
    activeId: conversation.id,
    conversations: [conversation],
  };
}

export function activeAgentConversation(state: AgentConversationState) {
  return (
    state.conversations.find((conversation) => conversation.id === state.activeId) ??
    state.conversations[state.conversations.length - 1]
  );
}

export function saveAgentConversationState(
  folderPath: string | null,
  state: AgentConversationState,
) {
  localStorage.setItem(conversationKey(folderPath), JSON.stringify(state));
}

export function saveActiveAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
  messages: AgentMessage[],
): AgentConversationState {
  const serializableMessages = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.content.trim())
    .slice(-40)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      action: message.action,
    }));
  const now = Date.now();
  const nextState = {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === state.activeId
        ? {
            ...conversation,
            title: conversationTitle(serializableMessages),
            updatedAt: now,
            messages: serializableMessages,
          }
        : conversation,
    ),
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}

export function startAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
) {
  const conversation = newConversation();
  const nextState = {
    activeId: conversation.id,
    conversations: [...state.conversations, conversation].slice(-30),
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}

export function selectAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
  conversationId: string,
) {
  const nextState = state.conversations.some(
    (conversation) => conversation.id === conversationId,
  )
    ? { ...state, activeId: conversationId }
    : state;
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}

export function clearAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
  conversationId: string,
) {
  const remainingConversations = state.conversations.filter(
    (conversation) => conversation.id !== conversationId,
  );
  const conversations = remainingConversations.length
    ? remainingConversations
    : [newConversation()];
  const nextState = {
    activeId: conversations.some((conversation) => conversation.id === state.activeId)
      ? state.activeId
      : conversations[conversations.length - 1].id,
    conversations,
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}

export function conversationContext(messages: AgentMessage[]): AiConversationMessage[] {
  return messages
    .filter(
      (message): message is AgentMessage & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .filter((message) => message.content.trim())
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export function isGreetingPrompt(prompt: string) {
  return /^(hi|hey|hello|yo|sup|good\s+(morning|afternoon|evening))[\s!.?]*$/i.test(
    prompt.trim(),
  );
}
