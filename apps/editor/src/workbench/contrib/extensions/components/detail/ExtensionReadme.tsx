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

// Matches the relative media a README can point at. Absolute URLs, anchors,
// data: URIs, and root-absolute paths are left alone because they already point
// somewhere the renderer can load (or are intentionally not ours to serve).
const RELATIVE_MEDIA_PATTERN = /^(?![\s/]|[a-zA-Z][a-zA-Z\d+\-.]*:)/;

// Renders the extension README inside the detail pane. Installed packages are
// read over IPC (scoped to the extension's own folder in the main process);
// extensions that are not installed yet fall back to the copy the marketplace
// registry published, which is why the pane can document a package the user has
// not downloaded.
export function ExtensionReadme({
  extensionId,
  fallbackReadme,
}: {
  extensionId: string;
  fallbackReadme: string | null;
}) {
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
        // A not-yet-installed extension has no local package to read, and the
        // host reports that as a failure. The registry copy is the intended
        // content in that case, so it is not an error state.
        if (!result.ok && !fallbackReadme) {
          setState({
            status: "error",
            readme: null,
            error: result.message,
          });
          return;
        }
        setState({
          status: "ready",
          readme: result.readme ?? fallbackReadme,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (fallbackReadme) {
          setState({ status: "ready", readme: fallbackReadme, error: null });
          return;
        }
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
  }, [extensionId, fallbackReadme]);

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

  // Relative image and video sources cannot resolve on their own: the pane is
  // injected into the editor origin, not served from the package folder. After
  // the sanitized HTML is in the DOM, every relative media source is swapped
  // for an axon://extension ticket minted by the main process. Doing it here
  // rather than on the markdown source is deliberate: DOMPurify strips the
  // axon: scheme, so the swap has to happen after sanitization.
  //
  // The container also constrains media with max-w-full because a README
  // screenshot arrives at its natural pixel width, which would otherwise push
  // a horizontal scrollbar through the 70ch pane.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || state.readme === null) return;

    const relativeSources = new Set<string>();
    for (const element of container.querySelectorAll("img[src], video[src]")) {
      const src = element.getAttribute("src");
      if (src && RELATIVE_MEDIA_PATTERN.test(src)) relativeSources.add(src);
    }
    if (relativeSources.size === 0) return;

    let cancelled = false;
    window.axon
      .getExtensionReadmeAssetUrls(extensionId, [...relativeSources])
      .then((result) => {
        if (cancelled || !result.ok) return;
        for (const element of container.querySelectorAll("img[src], video[src]")) {
          const src = element.getAttribute("src");
          const url = src ? result.urls[src] : undefined;
          if (url) element.setAttribute("src", url);
        }
      })
      .catch(() => {
        // A missing ticket only leaves the media unresolved. The rest of the
        // README still renders, so this is deliberately swallowed.
      });

    return () => {
      cancelled = true;
    };
  }, [extensionId, html, state.readme]);

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
          className="max-w-[70ch] text-[13px] leading-[22px] text-[var(--axon-editor-foreground)] [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_video]:max-w-full"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}