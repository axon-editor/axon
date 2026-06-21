import { ChevronDown, Trash2 } from "lucide-react";
import Tooltip from "../../shared/components/Tooltip";
import { type AgentConversationState } from "./agentConversation";

interface Props {
  activeTitle: string;
  conversationState: AgentConversationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestClear: (conversationId: string) => void;
  onSelect: (conversationId: string) => void;
}

export default function AgentConversationPicker(props: Props) {
  return (
    <div className="relative">
      <Tooltip label="Switch Ask Axon conversation" side="left">
        <button
          type="button"
          onClick={() => props.onOpenChange(!props.open)}
          aria-label="Switch Ask Axon conversation"
          className="flex h-8 max-w-[150px] cursor-pointer items-center gap-1 rounded px-2 text-[11px] text-[#77849a] transition-colors hover:bg-[#151923] hover:text-white"
        >
          <span className="truncate">{props.activeTitle}</span>
          <ChevronDown size={12} />
        </button>
      </Tooltip>
      {props.open ? (
        <div className="absolute right-0 top-9 z-50 w-64 overflow-hidden rounded-md border border-[#263047] bg-[#0b0f17] shadow-xl shadow-black/40">
          {props.conversationState.conversations
            .slice()
            .reverse()
            .map((conversation) => (
              <div
                key={conversation.id}
                className={`flex items-center gap-2 px-2 py-1.5 hover:bg-[#151b27] ${
                  conversation.id === props.conversationState.activeId
                    ? "bg-[#111827]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => props.onSelect(conversation.id)}
                  className={`min-w-0 flex-1 cursor-pointer rounded px-1 py-1 text-left text-[12px] ${
                    conversation.id === props.conversationState.activeId
                      ? "text-[#edf3ff]"
                      : "text-[#9aa7bb]"
                  }`}
                >
                  <span className="block truncate">{conversation.title}</span>
                </button>
                <Tooltip label="Clear conversation" side="left">
                  <button
                    type="button"
                    onClick={() => props.onRequestClear(conversation.id)}
                    aria-label={`Clear conversation ${conversation.title}`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[#647086] transition-colors hover:bg-[#2a1720] hover:text-[#ff8f8f]"
                  >
                    <Trash2 size={12} />
                  </button>
                </Tooltip>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
