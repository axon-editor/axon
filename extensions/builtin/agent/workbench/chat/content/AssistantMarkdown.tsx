/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatCodeBlock from "./ChatCodeBlock";

interface Props {
  content: string;
  onOpenLink?: (href: string) => void;
}

export default function AssistantMarkdown({ content, onOpenLink }: Props) {
  // In-page anchors stay in the message. Every other link goes through the
  // workbench so a dev-server URL cannot navigate the Electron renderer away
  // from the editor when the agent points at a workspace file.
  const handleLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href?: string,
  ) => {
    if (!href || href.startsWith("#")) return;
    event.preventDefault();

    if (onOpenLink) {
      onOpenLink(href);
      return;
    }

    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      void window.axon?.openExternalLink(href);
    }
  };

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
            <h1 className="mb-2 mt-4 text-[15px] font-semibold text-[var(--axon-editor-foreground)] first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-[14px] font-semibold text-[var(--axon-editor-foreground)] first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-[13px] font-semibold text-[var(--axon-editor-foreground)] first:mt-0">
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
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-[var(--axon-panel-border)]">
              <table className="w-full border-collapse text-[12px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)]/35">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 text-left text-[11px] font-semibold opacity-60">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-[var(--axon-panel-border)] px-2.5 py-1.5 align-top">
              {children}
            </td>
          ),
          hr: () => (
            <hr className="my-3 border-t border-[var(--axon-panel-border)]" />
          ),
          img: ({ src, alt, title }) => (
            <img
              src={src}
              alt={alt ?? ""}
              title={title}
              className="my-2 max-w-full"
            />
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              title={href}
              rel="noreferrer"
              onClick={(event) => handleLinkClick(event, href)}
              className="cursor-pointer break-words text-[var(--axon-syntax-function)] underline decoration-[var(--axon-syntax-function)]/40 underline-offset-2 hover:decoration-[var(--axon-syntax-function)]"
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
