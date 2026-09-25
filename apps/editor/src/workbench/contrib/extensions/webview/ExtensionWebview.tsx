/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { type ExtensionWebviewTarget } from "@axon-editor/shared/extensionWebview";
import { getExtensionWebviewTabLabel } from "./lib/extensionWebviewTabs";

interface Props {
  extensionId: string;
}

export default function ExtensionWebview({ extensionId }: Props) {
  const [target, setTarget] = useState<ExtensionWebviewTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTarget(null);

    window.axon
      .getExtensionWebviewTarget(extensionId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || !result.target) {
          setError(result.message ?? "Extension webview could not start.");
          return;
        }
        setTarget(result.target);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Extension webview could not start.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [extensionId]);

  const previewUrl = useMemo(() => {
    if (!target) return "";
    const separator = target.url.includes("?") ? "&" : "?";
    return `${target.url}${separator}axonReload=${reloadNonce}`;
  }, [target, reloadNonce]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--axon-editor-background)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--axon-editor-foreground)]">
          {getExtensionWebviewTabLabel(`axon-extension-webview:${extensionId}`)}
        </span>
        <span className="truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
          {extensionId}
        </span>
        <button
          type="button"
          aria-label="Reload extension webview"
          onClick={() => setReloadNonce((value) => value + 1)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-60">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-stretch overflow-auto bg-[var(--axon-editor-background)]">
          {previewUrl ? (
            <iframe
              key={previewUrl}
              title={`${extensionId} webview`}
              src={previewUrl}
              className="h-full w-full bg-white"
              // Extension webviews are served from Axon's localhost webview
              // server. Scripts run so the package behaves like normal web
              // content, but the frame is isolated from the Electron renderer
              // and can only report console output through the preview API.
              sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
              preparing extension webview...
            </div>
          )}
        </div>
      )}
    </div>
  );
}