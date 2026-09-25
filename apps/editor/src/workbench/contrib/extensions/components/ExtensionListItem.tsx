/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CheckCircle2 } from "lucide-react";
import type { ExtensionListModel } from "../lib/listingModels";
import { ExtensionAvatar } from "./ExtensionAvatar";
import { StatusPill } from "./StatusPill";

export function ExtensionListItem({
  item,
  selected,
  onSelect,
}: {
  item: ExtensionListModel;
  selected: boolean;
  onSelect: (extensionId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`group flex w-full cursor-pointer items-start gap-3 border-l-2 px-3 py-3 text-left transition-colors ${
        selected
          ? "border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)]"
          : "border-transparent hover:bg-[var(--axon-panel-overlay-hover)]"
      }`}
    >
      <ExtensionAvatar name={item.name} publisher={item.publisher} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
            {item.name}
          </span>
          {item.installed ? (
            <CheckCircle2
              size={13}
              className="shrink-0 text-[#8fe3a2]"
              aria-label="installed"
            />
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
          {item.publisher} · v{item.version}
        </div>
        <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-60">
          {item.description || "No description provided."}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-60">
            {item.kind}
          </span>
          {item.lifecycle && item.lifecycle !== "active" ? (
            <StatusPill status={item.lifecycle} />
          ) : null}
          {item.hasWebview ? (
            <span className="rounded bg-[#152e3d] px-1.5 py-0.5 text-[10px] text-[#8fb5d1]">
              webview
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}