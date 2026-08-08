import DOMPurify from "dompurify";
import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shell",
  cjs: "javascript",
  cs: "csharp",
  js: "javascript",
  jsx: "javascriptreact",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  ts: "typescript",
  tsx: "typescriptreact",
  yml: "yaml",
};

interface HighlightedCodeBlockProps {
  children: ReactNode;
  language: string;
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  return "";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    await window.axon.copyText(text);
  }
}

export default function HighlightedCodeBlock({
  children,
  language,
}: HighlightedCodeBlockProps) {
  const code = useMemo(
    () => textFromChildren(children).replace(/\n$/, ""),
    [children],
  );
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const request = ++requestRef.current;
    let disposed = false;

    const highlight = async () => {
      try {
        const monaco = await import("monaco-editor");
        const languageId = LANGUAGE_ALIASES[language] ?? language;
        const html = await monaco.editor.colorize(code, languageId, {
          tabSize: 4,
        });
        if (disposed || request !== requestRef.current) return;

        // Monaco escapes source text before producing token spans. Sanitizing
        // its result as a second boundary means a malformed tokenizer or a
        // future custom language cannot turn a Markdown fence into executable
        // renderer markup.
        setHighlightedHtml(
          DOMPurify.sanitize(html, {
            ALLOWED_ATTR: ["class", "style"],
            ALLOWED_TAGS: ["br", "span"],
          }),
        );
      } catch {
        if (!disposed && request === requestRef.current) {
          setHighlightedHtml(null);
        }
      }
    };

    const timer = window.setTimeout(() => void highlight(), 20);
    const observer = new MutationObserver(() => void highlight());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch (error) {
      console.error("failed to copy markdown code block:", error);
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
      <pre className="m-0 overflow-x-auto p-4 text-[13px] leading-6 text-[var(--axon-editor-foreground)]">
        {highlightedHtml ? (
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
      <div className="absolute right-2 top-2 flex items-center gap-2">
        {language !== "text" ? (
          <span className="rounded bg-[var(--axon-editor-background)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-0 transition-opacity group-hover:opacity-55">
            {language}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied code" : "Copy code"}
          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border shadow-sm transition-all ${
            copied
              ? "border-[var(--axon-syntax-string)] bg-[var(--axon-panel-background)] text-[var(--axon-syntax-string)]"
              : "border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] opacity-60 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 group-hover:opacity-100"
          }`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}
