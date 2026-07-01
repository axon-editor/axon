import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[12px] leading-5 text-[var(--axon-editor-foreground)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          h1: ({ children }) => (
            <h1 className="mb-2 text-[16px] font-semibold text-[var(--axon-editor-foreground)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-[14px] font-semibold text-[var(--axon-editor-foreground)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--axon-editor-foreground)]">
              {children}
            </h3>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[var(--axon-panel-overlay-hover)] px-1 py-0.5 text-[11px] text-[var(--axon-syntax-string)]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 max-w-full overflow-x-auto rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-3 text-[11px] leading-5 text-[var(--axon-editor-foreground)] last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[var(--axon-syntax-function)] pl-3 text-[var(--axon-editor-foreground)] opacity-65 last:mb-0">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[var(--axon-syntax-function)] underline decoration-[var(--axon-syntax-function)] underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
