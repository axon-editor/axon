/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExternalLink } from "lucide-react";

export function SourceLinkButton({ href }: { href: string | null }) {
  if (!href) return null;

  return (
    <button
      type="button"
      onClick={() => void window.axon.openExternalLink(href)}
      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-70 transition-colors hover:border-[var(--axon-syntax-function)] hover:opacity-100"
    >
      <ExternalLink size={12} />
      Source
    </button>
  );
}