/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { FileText, Loader2, TriangleAlert } from "lucide-react";
import { parse } from "@axon-builtin-markdown/lib/parser";
import {
  renderSync,
  type RenderContext,
} from "@axon-builtin-markdown/lib/renderer";

// Renders the installed extension package's README inside the detail pane.
// Content is fetched over IPC (scoped to the extension's own folder in the
// main process), parsed with the same markdown pipeline the editor preview
// uses, then sanitized in the renderer before being injected.
export function ExtensionReadme({ extensionId }: { extensionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    readme: string | null;
    error: string | null;
  }>({ status: "loading", readme: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", readme: null, error: null });

    window.axon
      .getExtensionReadme(extensionId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({
            status: "error",
            readme: null,
            error: result.message,
          });
          return;
        }
        setState({
          status: "ready",
          readme: result.readme,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          readme: null,
          error:
            err instanceof Error
              ? err.message
              : "Failed to load the extension README.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [extensionId]);

  const html = useMemo(() => {
    if (state.readme === null) return null;
    const { tokens } = parse(state.readme, {
      gfm: true,
      callouts: true,
      frontmatter: true,
    });
    const context: RenderContext = {
      filePath: `${extensionId}-README.md`,
      folderPath: null,
    };
    return DOMPurify.sanitize(renderSync(tokens, context), {
      USE_PROFILES: { html: true },
    });
  }, [state.readme, extensionId]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    if (href.startsWith("#")) {
      event.preventDefault();
      const target = containerRef.current?.querySelector(
        `#${CSS.escape(href.slice(1))}`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      event.preventDefault();
      window.axon?.openExternalLink(href);
    }
  }, []);

  return (
    <div className="mt-6 border-t border-[var(--axon-panel-border)] pt-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
        <FileText size={12} />
        README
      </div>

      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-50">
          <Loader2 size={13} className="animate-spin" />
          Loading README…
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-2 text-[12px] text-[#ff9aa2]">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {state.status === "ready" && state.readme === null && (
        <div className="text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
          This extension does not ship a README.
        </div>
      )}

      {state.status === "ready" && html !== null && (
        <div
          ref={containerRef}
          onClick={handleClick}
          className="max-w-[70ch] text-[13px] leading-[22px] text-[var(--axon-editor-foreground)]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}