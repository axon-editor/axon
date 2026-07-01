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
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
                {message.role === "assistant" ? "Axon" : "You"}
              </span>
              {message.role === "assistant" ? (
                <button
                  type="button"
                  onClick={() => {
                    void window.axon.copyText(message.content);
                    props.onCopied(message.id);
                  }}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
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
              <div className="whitespace-pre-wrap rounded-md bg-[var(--axon-panel-overlay-hover)] px-3 py-2 text-[12px] leading-5 text-[var(--axon-editor-foreground)]">
                {message.content}
              </div>
            ) : message.content ? (
              <AssistantMarkdown content={message.content} />
            ) : (
              <StreamingIndicator />
            )}
            {message.result?.editProposal ? (
              <div className="mt-3 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
                <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-2 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
                  <FilePenLine size={12} className="text-[var(--axon-syntax-function)]" />
                  {message.result.editProposal.title}
                </div>
                {message.result.editProposal.files.map((file) => (
                  <div
                    key={file.path}
                    className="border-b border-[var(--axon-panel-border)] p-2 last:border-b-0"
                  >
                    <div className="truncate text-[11px] text-[var(--axon-editor-foreground)]">
                      {file.path}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
                      {file.summary}
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onApplyEdit(file)}
                      className="mt-2 h-7 cursor-pointer rounded bg-[var(--axon-panel-overlay-hover)] px-2 text-[11px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
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
