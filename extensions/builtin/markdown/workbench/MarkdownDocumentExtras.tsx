import {
  AlertTriangle,
  BookOpen,
  CircleAlert,
  Info,
  Lightbulb,
  OctagonAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import type { MarkdownReference } from "./lib/markdownDocument";

const CALLOUT_ICONS = {
  caution: OctagonAlert,
  important: CircleAlert,
  note: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
} as const;

interface MarkdownCalloutProps {
  children: ReactNode;
  kind?: string;
}

export function MarkdownCallout({ children, kind = "note" }: MarkdownCalloutProps) {
  const normalizedKind = kind.toLowerCase() as keyof typeof CALLOUT_ICONS;
  const Icon = CALLOUT_ICONS[normalizedKind] ?? Info;

  return (
    <aside
      data-callout={normalizedKind}
      className="my-4 border-l-[3px] border-[var(--axon-syntax-function)] bg-[var(--axon-panel-background)] px-4 py-3 text-[13px] leading-6 text-[var(--axon-editor-foreground)]"
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase text-[var(--axon-syntax-function)]">
        <Icon size={14} />
        <span>{normalizedKind}</span>
      </div>
      <div className="[&>p]:my-0 [&>p+p]:mt-2">{children}</div>
    </aside>
  );
}

function displayFrontmatterValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

export function FrontmatterPanel({
  metadata,
  error,
}: {
  metadata: Record<string, unknown> | null;
  error: string | null;
}) {
  if (!metadata && !error) return null;
  const entries = Object.entries(metadata ?? {}).filter(
    ([key]) => !["bibliography", "references"].includes(key),
  );

  return (
    <section className="mb-6 overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[12px]">
      <header className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-2 font-medium text-[var(--axon-editor-foreground)]">
        <BookOpen size={13} className="text-[var(--axon-syntax-function)]" />
        Frontmatter
      </header>
      {error ? (
        <div role="alert" className="px-3 py-2 text-[var(--axon-syntax-keyword)]">
          {error}
        </div>
      ) : (
        <dl className="grid grid-cols-[minmax(90px,auto)_1fr]">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="border-b border-r border-[var(--axon-panel-border)] px-3 py-2 font-medium text-[var(--axon-editor-foreground)] opacity-65">
                {key}
              </dt>
              <dd className="min-w-0 break-words border-b border-[var(--axon-panel-border)] px-3 py-2 text-[var(--axon-editor-foreground)]">
                {displayFrontmatterValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function MarkdownReferences({
  references,
}: {
  references: MarkdownReference[];
}) {
  if (references.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[var(--axon-panel-border)] pt-5">
      <h2 className="mb-3 text-[18px] font-semibold text-[var(--axon-editor-foreground)]">
        References
      </h2>
      <ol className="space-y-2 pl-5 text-[13px]">
        {references.map((reference) => (
          <li key={reference.id} id={`citation-${reference.id}`} className="scroll-mt-4 pl-1">
            <span className="font-medium text-[var(--axon-editor-foreground)]">
              [{reference.id}]
            </span>{" "}
            {reference.author ? `${reference.author}. ` : ""}
            {reference.url ? (
              <a
                href={reference.url}
                onClick={(event) => {
                  event.preventDefault();
                  void window.axon.openExternalLink(reference.url!);
                }}
                className="text-[var(--axon-syntax-function)] hover:underline"
              >
                {reference.title}
              </a>
            ) : (
              reference.title
            )}
            {reference.year ? ` (${reference.year})` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
