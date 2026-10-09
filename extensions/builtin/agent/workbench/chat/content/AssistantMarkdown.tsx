/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatCodeBlock from "./ChatCodeBlock";

export default function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[13px] leading-5 text-[var(--axon-editor-foreground)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-2.5 list-disc space-y-1 pl-4 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2.5 list-decimal space-y-1 pl-4 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          h1: ({ children }) => (
            <h1 className="mb-2 text-[15px] font-semibold text-[var(--axon-editor-foreground)]">
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
          code: ({ children, className }) => {
            const isBlock = className?.startsWith("language-");
            if (isBlock && className) {
              const language = className.replace("language-", "");
              return (
                <ChatCodeBlock language={language}>
                  {String(children).replace(/\n$/, "")}
                </ChatCodeBlock>
              );
            }
            return (
              <code className="rounded bg-[var(--axon-panel-overlay-hover)] px-1 py-0.5 text-[12px] text-[var(--axon-syntax-string)]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({ children }) => (
            <blockquote className="mb-2.5 border-l-2 border-[var(--axon-syntax-function)]/40 pl-3 text-[var(--axon-editor-foreground)] opacity-60 last:mb-0">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[var(--axon-syntax-function)] underline decoration-[var(--axon-syntax-function)]/40 underline-offset-2 hover:decoration-[var(--axon-syntax-function)]"
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
