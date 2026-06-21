import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[12px] leading-5 text-[#d3dbea]">
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
            <h1 className="mb-2 text-[16px] font-semibold text-[#edf3ff]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-[14px] font-semibold text-[#edf3ff]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-[13px] font-semibold text-[#edf3ff]">
              {children}
            </h3>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[#101722] px-1 py-0.5 text-[11px] text-[#bfe9ff]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 max-w-full overflow-x-auto rounded-md border border-[#243047] bg-[#090d13] p-3 text-[11px] leading-5 text-[#dce4f0] last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[#37516a] pl-3 text-[#aeb8ca] last:mb-0">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[#80c8e0] underline decoration-[#31566a] underline-offset-2"
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
