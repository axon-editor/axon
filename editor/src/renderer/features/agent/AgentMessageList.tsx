import { Check, Copy, FilePenLine } from "lucide-react";
import { type AiEditFileProposal } from "../../../shared/ai";
import AssistantMarkdown from "./AssistantMarkdown";
import StreamingIndicator from "./StreamingIndicator";
import { type AgentMessage } from "./agentConversation";

interface Props {
  copiedId: number | null;
  messages: AgentMessage[];
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
}

export default function AgentMessageList(props: Props) {
  return (
    <>
      {props.messages.map((message) => (
        <div
          key={message.id}
          className={`mb-5 flex ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={
              message.role === "user" ? "max-w-[82%]" : "w-full max-w-full"
            }
          >
            <div
              className={`mb-1 flex items-center gap-2 ${
                message.role === "user" ? "justify-end" : "justify-between"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#647086]">
                {message.role === "assistant" ? "Axon" : "You"}
              </span>
              {message.role === "assistant" ? (
                <button
                  type="button"
                  onClick={() => {
                    void window.axon.copyText(message.content);
                    props.onCopied(message.id);
                  }}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#647086] hover:bg-[#202838] hover:text-white"
                  aria-label="Copy response"
                >
                  {props.copiedId === message.id ? (
                    <Check size={12} />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              ) : null}
            </div>
            {message.role === "user" ? (
              <div className="whitespace-pre-wrap rounded-md bg-[#14212d] px-3 py-2 text-[12px] leading-5 text-[#edf3ff]">
                {message.content}
              </div>
            ) : message.content ? (
              <AssistantMarkdown content={message.content} />
            ) : (
              <StreamingIndicator />
            )}
            {message.result?.editProposal ? (
              <div className="mt-3 rounded border border-[#263047] bg-[#0b0f17]">
                <div className="flex items-center gap-2 border-b border-[#1d2432] px-2 py-1.5 text-[11px] text-[#9aa4b8]">
                  <FilePenLine size={12} className="text-[#80c8e0]" />
                  {message.result.editProposal.title}
                </div>
                {message.result.editProposal.files.map((file) => (
                  <div
                    key={file.path}
                    className="border-b border-[#151b27] p-2 last:border-b-0"
                  >
                    <div className="truncate text-[11px] text-[#dce4f0]">
                      {file.path}
                    </div>
                    <div className="mt-1 text-[11px] text-[#647086]">
                      {file.summary}
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onApplyEdit(file)}
                      className="mt-2 h-7 cursor-pointer rounded bg-[#16323c] px-2 text-[11px] text-[#dff7ff] hover:bg-[#1d4350]"
                    >
                      Apply file
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
      <div ref={props.scrollAnchorRef} />
    </>
  );
}
