import {
  type AiActionId,
  type AiChatResult,
  type AiConversationMessage,
} from "../../../shared/ai";

export interface AgentMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  action?: AiActionId;
  result?: AiChatResult;
}

const conversationPrefix = "axon:agentConversation:";

function conversationKey(folderPath: string | null) {
  return `${conversationPrefix}${folderPath ?? "no-workspace"}`;
}

export function loadAgentConversation(folderPath: string | null): AgentMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(conversationKey(folderPath)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (message): message is AgentMessage =>
          typeof message === "object" &&
          message !== null &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      )
      .slice(-40);
  } catch {
    return [];
  }
}

export function saveAgentConversation(
  folderPath: string | null,
  messages: AgentMessage[],
) {
  const serializable = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.content.trim())
    .slice(-40)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      action: message.action,
    }));
  localStorage.setItem(conversationKey(folderPath), JSON.stringify(serializable));
}

export function conversationContext(messages: AgentMessage[]): AiConversationMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
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
