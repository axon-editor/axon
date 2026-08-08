import DOMPurify from "dompurify";
import { FileDown, LoaderCircle, Printer } from "lucide-react";
import { useState, type RefObject } from "react";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

const THEME_VARIABLES = [
  "--axon-editor-background",
  "--axon-editor-foreground",
  "--axon-panel-background",
  "--axon-panel-border",
  "--axon-panel-overlay-hover",
  "--axon-syntax-function",
  "--axon-syntax-keyword",
  "--axon-syntax-string",
];

function printableStyles() {
  const theme = getComputedStyle(document.documentElement);
  const variables = THEME_VARIABLES.map(
    (name) => `${name}:${theme.getPropertyValue(name).trim()};`,
  ).join("");

  const styleSheets = Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules, (rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");

  return `:root{${variables}}${styleSheets}
    html,body{margin:0;background:var(--axon-editor-background);color:var(--axon-editor-foreground)}
    body{padding:36px;font-family:Inter,system-ui,sans-serif}
    article{max-width:900px;margin:0 auto}
    [data-markdown-toolbar]{display:none!important}
    @page{size:A4;margin:16mm}`;
}

function printableDocument(article: HTMLElement, title: string) {
  const safeArticle = DOMPurify.sanitize(article.outerHTML, {
    ADD_ATTR: ["data-callout", "data-citation", "data-mdx-component", "data-source-line"],
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
  const safeTitle = DOMPurify.sanitize(title, { ALLOWED_TAGS: [] });

  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: axon: https:; style-src 'unsafe-inline'; font-src data: axon:"><title>${safeTitle}</title><style>${printableStyles()}</style></head><body>${safeArticle}</body></html>`;
}

interface MarkdownPreviewToolbarProps {
  articleRef: RefObject<HTMLElement | null>;
  filePath: string;
}

export default function MarkdownPreviewToolbar({
  articleRef,
  filePath,
}: MarkdownPreviewToolbarProps) {
  const [exporting, setExporting] = useState(false);
  const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.(md|mdx|markdown)$/i, "") || "document";

  const handlePrint = () => {
    const article = articleRef.current;
    if (!article) return;
    article.dataset.axonPrintRoot = "true";
    document.body.classList.add("axon-markdown-printing");
    const cleanup = () => {
      document.body.classList.remove("axon-markdown-printing");
      delete article.dataset.axonPrintRoot;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1_000);
  };

  const handlePdfExport = async () => {
    const article = articleRef.current;
    if (!article || exporting) return;
    setExporting(true);
    try {
      await window.axon.saveMarkdownPdf(
        `${fileName}.pdf`,
        printableDocument(article, fileName),
      );
    } catch (error) {
      console.error("failed to export Markdown PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      data-markdown-toolbar
      className="sticky top-0 z-10 flex h-9 items-center justify-end gap-1 border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-3"
    >
      <Tooltip label="Print Markdown" side="bottom">
        <button
          type="button"
          onClick={handlePrint}
          aria-label="Print Markdown"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <Printer size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Export PDF" side="bottom">
        <button
          type="button"
          onClick={handlePdfExport}
          disabled={exporting}
          aria-label="Export Markdown as PDF"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-wait"
        >
          {exporting ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <FileDown size={14} />
          )}
        </button>
      </Tooltip>
      <style>{`@media print {
        body.axon-markdown-printing * { visibility: hidden !important; }
        body.axon-markdown-printing [data-axon-print-root],
        body.axon-markdown-printing [data-axon-print-root] * { visibility: visible !important; }
        body.axon-markdown-printing [data-axon-print-root] { position: absolute; inset: 0; width: 100%; max-width: none; padding: 28px; }
        body.axon-markdown-printing [data-markdown-toolbar] { display: none !important; }
      }`}</style>
    </div>
  );
}
