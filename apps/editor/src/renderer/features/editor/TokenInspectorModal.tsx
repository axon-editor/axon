import { useEffect, useRef, useState } from "react";
import { Copy, Palette, TextCursorInput } from "lucide-react";
import CommandModal from "../../shared/components/CommandModal";
import { type TokenInspectorReport } from "./lib/tokenInspector";

interface TokenInspectorModalProps {
  report: TokenInspectorReport;
  onClose: () => void;
}

function tokenLabel(value: string | null) {
  return value && value.trim() ? value : "not reported";
}

export default function TokenInspectorModal({
  report,
  onClose,
}: TokenInspectorModalProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const fileName = report.filePath.split(/[\\/]/).pop() ?? report.filePath;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  const copyReport = () => {
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      if (!mountedRef.current) return;
      setCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        if (mountedRef.current) setCopied(false);
      }, 1400);
    });
  };

  return (
    <CommandModal
      title="token inspector"
      width="w-[min(760px,calc(100vw-2rem))]"
      bodyClassName="max-h-[min(640px,calc(100vh-7rem))] overflow-auto"
      onClose={onClose}
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-3">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
              {fileName}
            </div>
            <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
              {report.languageId} · line {report.line}, column {report.column}
            </div>
          </div>
          <button
            type="button"
            onClick={copyReport}
            className={`flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] px-2 text-[11px] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] ${
              copied
                ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)] opacity-100"
                : "bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] opacity-70 hover:opacity-100"
            }`}
          >
            <Copy size={13} />
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-3">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
              <TextCursorInput size={13} />
              Token
            </div>
            <dl className="space-y-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Text
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-syntax-function)]">
                  {report.tokenText || "empty"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Word
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)]">
                  {report.word || "none"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Model class
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-syntax-method)]">
                  {report.modelTokenClassName}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Model language
                </dt>
                <dd className="font-mono text-[var(--axon-editor-foreground)]">
                  {report.modelTokenLanguage}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Model type
                </dt>
                <dd className="font-mono text-[var(--axon-editor-foreground)]">
                  {report.modelTokenType}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Inferred scope
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)] opacity-70">
                  {report.inferredMonacoToken}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Semantic
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)] opacity-70">
                  {report.semanticTokenType ?? "none"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Sem range
                </dt>
                <dd className="font-mono text-[var(--axon-editor-foreground)]">
                  {report.semanticTokenRange ?? "none"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Sem selector
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)] opacity-70">
                  {report.semanticSelector ?? "none"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Sem color
                </dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border border-[var(--axon-panel-border)]"
                    style={{
                      backgroundColor: report.semanticExpectedColor ?? undefined,
                    }}
                  />
                  <span className="truncate font-mono text-[var(--axon-editor-foreground)]">
                    {report.semanticExpectedColor ?? "none"}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Range
                </dt>
                <dd className="font-mono text-[var(--axon-editor-foreground)]">
                  {report.tokenStartColumn}-{report.tokenEndColumn}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-3">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
              <Palette size={13} />
              Rendered Color
            </div>
            <dl className="space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  DOM color
                </dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border border-[var(--axon-panel-border)]"
                    style={{ backgroundColor: report.renderedColor ?? undefined }}
                  />
                  <span className="truncate font-mono text-[var(--axon-editor-foreground)]">
                    {tokenLabel(report.renderedColor)}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Font style
                </dt>
                <dd className="font-mono text-[var(--axon-editor-foreground)]">
                  {tokenLabel(report.renderedFontStyle)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Font weight
                </dt>
                <dd className="font-mono text-[var(--axon-editor-foreground)]">
                  {tokenLabel(report.renderedFontWeight)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  DOM class
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)]">
                  {tokenLabel(report.renderedClassName)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  Expected class
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)]">
                  {report.semanticDecorationClassName ?? "none"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                  TextMate
                </dt>
                <dd className="min-w-0 truncate font-mono text-[var(--axon-editor-foreground)]">
                  {report.textMateHighlighterReady ? "ready" : "not ready"}
                </dd>
              </div>
              {report.textMateHighlighterError && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--axon-editor-foreground)] opacity-50">
                    TM error
                  </dt>
                  <dd className="min-w-0 truncate font-mono text-[var(--axon-syntax-constant)]">
                    {report.textMateHighlighterError}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <section className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--axon-panel-border)] px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
              Axon Captures
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-40">
              {report.inferenceSource === "model"
                ? "model token color + inferred capture"
                : "standalone line inference"}
            </span>
          </div>
          {report.captures.length > 0 ? (
            <div className="divide-y divide-[var(--axon-panel-border)]">
              {report.captures.map((capture) => (
                <div
                  key={`${capture.capture}:${capture.matchedToken}:${capture.match}`}
                  className="grid gap-2 px-3 py-2 text-[12px] md:grid-cols-[1fr_1fr_90px_120px]"
                >
                  <span className="truncate font-mono text-[var(--axon-syntax-function)]">
                    {capture.capture}
                  </span>
                  <span className="truncate font-mono text-[var(--axon-editor-foreground)] opacity-70">
                    {capture.matchedToken}
                  </span>
                  <span className="font-mono text-[var(--axon-editor-foreground)] opacity-55">
                    {capture.match}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[var(--axon-editor-foreground)]">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-[var(--axon-panel-border)]"
                      style={{
                        backgroundColor: capture.expectedColor ?? undefined,
                      }}
                    />
                    {capture.expectedColor ?? "theme override"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-[12px] text-[var(--axon-editor-foreground)] opacity-60">
              No Axon capture currently maps this Monaco token.
            </div>
          )}
        </section>

        <section className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
            Line Preview
          </div>
          <pre className="overflow-auto whitespace-pre text-[12px] leading-5 text-[var(--axon-editor-foreground)]">
            {report.linePreview}
          </pre>
        </section>
      </div>
    </CommandModal>
  );
}
