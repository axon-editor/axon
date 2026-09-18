/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { highlightCode } from "../lib/shikiHighlight";

interface ChatCodeBlockProps {
  children: string;
  language?: string;
}

const COLLAPSE_THRESHOLD = 20;

export default function ChatCodeBlock({ children, language }: ChatCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => children.split("\n").length > COLLAPSE_THRESHOLD,
  );
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const lang = language ?? "text";

    highlightCode(children, lang)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [children, language]);

  const lineCount = children.split("\n").length;
  const isCollapsible = lineCount > COLLAPSE_THRESHOLD;

  const handleCopy = () => {
    void navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="group/code relative my-2.5 overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] last:my-0">
      <div className="flex items-center justify-between border-b border-[var(--axon-panel-border)] px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--axon-editor-foreground)] opacity-35">
          {language ?? "code"}
        </span>
        <div className="flex items-center gap-0.5">
          {isCollapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-5 cursor-pointer items-center gap-1 rounded px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-40 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            >
              {collapsed ? (
                <>
                  <ChevronDown size={10} />
                  Show {lineCount}
                </>
              ) : (
                <>
                  <ChevronUp size={10} />
                  Collapse
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-0 hover:bg-[var(--axon-panel-overlay-hover)] group-hover/code:opacity-40 hover:!opacity-100"
            aria-label="Copy code"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      <div
        ref={codeRef}
        className={`overflow-x-auto ${collapsed ? "max-h-[200px]" : ""}`}
      >
        {html ? (
          <div
            className="p-3 text-[12px] leading-5 [&_pre]:bg-transparent [&_pre]:p-0"
            dangerouslySetInnerHTML={{ __html: stripPreTag(html) }}
          />
        ) : (
          <pre className="p-3 text-[12px] leading-5 text-[var(--axon-editor-foreground)]">
            <code>{children}</code>
          </pre>
        )}
      </div>

      {collapsed && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-lg bg-gradient-to-t from-[var(--axon-editor-background)] to-transparent" />
      )}
    </div>
  );
}

function stripPreTag(html: string): string {
  return html
    .replace(/<pre[^>]*>/, "")
    .replace(/<\/pre>$/, "");
}
