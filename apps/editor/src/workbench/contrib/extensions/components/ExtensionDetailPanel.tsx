/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  Download,
  PackageCheck,
  Play,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { type ReactNode } from "react";
import type { ExtensionListModel } from "../lib/listingModels";
import { isNoteworthyLifecycle } from "../lib/extensionModalUtils";
import { ExtensionAvatar } from "./ExtensionAvatar";
import { ExtensionReadme } from "./ExtensionReadme";
import { SourceLinkButton } from "./SourceLinkButton";
import { StatusPill } from "./StatusPill";

export function ExtensionDetailPanel({
  item,
  variant,
  placeholder,
  busy,
  confirmingUninstall,
  onToggle,
  onRequestUninstall,
  onConfirmUninstall,
  onOpen,
  onInstall,
}: {
  item: ExtensionListModel | null;
  variant: "installed" | "download";
  placeholder: ReactNode;
  busy: boolean;
  confirmingUninstall: boolean;
  onToggle: (extensionId: string, enabled: boolean) => void;
  onRequestUninstall: (extensionId: string | null) => void;
  onConfirmUninstall: (extensionId: string) => void;
  onOpen: (extensionId: string) => void;
  onInstall: (extensionId: string) => void;
}) {
  if (!item) {
    return (
      <div className="flex min-h-full items-center justify-center px-8 py-12">
        <div className="max-w-sm text-center">
          {placeholder}
        </div>
      </div>
    );
  }

  const removeable =
    variant === "installed" && !item.builtin && item.sourceLabel === "user";
  const sourceLink =
    item.repositoryUrl ?? item.homepageUrl;

  return (
    <div className="flex min-h-full flex-col px-6 py-6">
      <div className="flex items-start gap-4">
        <ExtensionAvatar name={item.name} publisher={item.publisher} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-semibold text-[var(--axon-editor-foreground)]">
              {item.name}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
              v{item.version}
            </span>
            {item.builtin && (
              <span className="inline-flex items-center gap-1 rounded bg-[#152019] px-1.5 py-0.5 text-[10px] text-[#8fe3a2]">
                <ShieldCheck size={10} />
                built-in
              </span>
            )}
            {isNoteworthyLifecycle(item.lifecycle) && (
              <StatusPill status={item.lifecycle} />
            )}
          </div>
          <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
            {item.publisher} / {item.id}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-60">
              {item.kind}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-syntax-function)] opacity-80">
              {item.sourceLabel}
            </span>
            {item.hasWebview && (
              <span className="rounded bg-[#152e3d] px-1.5 py-0.5 text-[10px] text-[#8fb5d1]">
                webview page
              </span>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <p className="mt-5 max-w-[58ch] text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-75">
          {item.description}
        </p>
      )}

      {(item.contributionCount > 0 || item.contributionLabels.length > 0) && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {variant === "installed" && (
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
              {item.contributionCount} contributions
            </span>
          )}
          {item.contributionLabels.map((label) => (
            <span
              key={label}
              className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-65"
            >
              {label}
            </span>
          ))}
          {item.themeLabels.map((label) => (
            <span
              key={label}
              className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-65"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {item.errors.length > 0 && (
        <div className="mt-5 flex items-start gap-2 rounded-md border border-[#3a2024] bg-[#1b0f13] px-3 py-2 text-[11px] text-[#ff9aa2]">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>{item.errors[0]}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {variant === "installed" ? (
          <>
            {item.hasWebview && (
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                disabled={busy}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-syntax-function)] bg-[#152019] px-4 text-[12px] font-medium text-[#8fe3a2] transition-colors hover:bg-[#1c2a20] disabled:cursor-default disabled:opacity-55"
              >
                <Play size={13} />
                Open
              </button>
            )}
            {item.enabled !== null && !item.builtin && (
              <button
                type="button"
                onClick={() => onToggle(item.id, !item.enabled)}
                disabled={busy}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-4 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-default disabled:opacity-55"
              >
                {item.enabled ? "Disable" : "Enable"}
              </button>
            )}
            {removeable && (
              confirmingUninstall ? (
                <>
                  <button
                    type="button"
                    onClick={() => onConfirmUninstall(item.id)}
                    disabled={busy}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#3a2024] bg-[#341b20] px-4 text-[12px] font-medium text-[#ff8b92] transition-colors hover:bg-[#452329] disabled:cursor-default disabled:opacity-55"
                  >
                    <Trash2 size={13} />
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestUninstall(null)}
                    className="flex h-9 cursor-pointer items-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-70 transition-colors hover:opacity-100"
                    aria-label="Cancel remove"
                  >
                    <X size={13} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onRequestUninstall(item.id)}
                  disabled={busy}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-4 text-[12px] text-[var(--axon-editor-foreground)] opacity-70 transition-colors hover:border-[#ff8b92] hover:opacity-100 disabled:cursor-default disabled:opacity-55"
                >
                  <Trash2 size={13} />
                  Uninstall
                </button>
              )
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => onInstall(item.id)}
            disabled={item.installed || busy}
            className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border px-4 text-[12px] font-medium transition-colors disabled:cursor-default disabled:opacity-55 ${
              item.installed
                ? "border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] text-[var(--axon-editor-foreground)]"
                : "border-[#8fb5d1] bg-[#152e3d] text-[#8fb5d1] hover:bg-[#1d3a4d]"
            }`}
          >
            {item.installed ? <PackageCheck size={13} /> : <Download size={13} />}
            {item.installed
              ? "Installed"
              : busy
                ? "Installing"
                : "Install"}
          </button>
        )}
        {sourceLink && <SourceLinkButton href={sourceLink} />}
      </div>

      {item.installed && !item.builtin && (
        <ExtensionReadme extensionId={item.id} />
      )}

      <div className="mt-auto pt-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 border-t border-[var(--axon-panel-border)] pt-4 text-[11px]">
          <MetaLabel label="ID" value={item.id} />
          <MetaLabel label="Publisher" value={item.publisher} />
          <MetaLabel label="Version" value={item.version} />
          <MetaLabel label="Kind" value={item.kind} />
          <MetaLabel label="Source" value={item.sourceLabel} />
          <MetaLabel
            label="Webview"
            value={item.hasWebview ? "Yes" : "No"}
          />
          {isNoteworthyLifecycle(item.lifecycle) && (
            <MetaLabel label="Lifecycle" value={item.lifecycle} />
          )}
          <MetaLabel
            label="Contributions"
            value={
              variant === "installed"
                ? String(item.contributionCount)
                : String(item.contributionLabels.length)
            }
          />
        </div>
      </div>
    </div>
  );
}

function MetaLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[var(--axon-editor-foreground)] opacity-40">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[var(--axon-editor-foreground)]">
        {value}
      </div>
    </div>
  );
}