/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Blocks,
  CheckCircle2,
  FolderOpen,
  PackageX,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  type ExtensionMarketplaceState,
  type ExtensionState,
} from "../../../shared/extensions";
import CommandModal from "../../../renderer/shared/components/CommandModal";
import { ExtensionDetailPanel } from "./components/ExtensionDetailPanel";
import { ExtensionListItem } from "./components/ExtensionListItem";
import {
  getErrorMessage,
  hasMarketplaceApi,
  matchesSearch,
} from "./lib/extensionModalUtils";
import {
  toDownloadListModel,
  toInstalledListModel,
} from "./lib/listingModels";
import { summarizeExtension } from "./lib/extensionSummaries";

interface Props {
  folderPath: string | null;
  extensionState: ExtensionState | null;
  onExtensionsChanged: (state: ExtensionState) => void;
  onOpenWebview: (extensionId: string) => void;
  onClose: () => void;
}

type ExtensionTab = "installed" | "downloads";

export default function ExtensionsModal({
  folderPath,
  extensionState,
  onExtensionsChanged,
  onOpenWebview,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<ExtensionTab>("installed");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBundled, setShowBundled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingUninstallId, setConfirmingUninstallId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [marketplaceState, setMarketplaceState] =
    useState<ExtensionMarketplaceState | null>(null);

  const installedExtensions = useMemo(
    () => (extensionState?.extensions ?? []).map(summarizeExtension),
    [extensionState],
  );

  const visibleInstalled = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return installedExtensions.filter(
      (extension) =>
        (showBundled || !extension.builtin) &&
        matchesSearch(
          query,
          extension.id,
          extension.name,
          extension.publisher,
          extension.description,
          extension.themeLabels.join(" "),
          extension.keywords.join(" "),
          extension.errors.join(" "),
        ),
    );
  }, [installedExtensions, searchQuery, showBundled]);

  const visibleDownloads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (marketplaceState?.items ?? []).filter((item) =>
      matchesSearch(
        query,
        item.id,
        item.name,
        item.publisher,
        item.description,
        item.categories.join(" "),
      ),
    );
  }, [marketplaceState, searchQuery]);

  const installedModels = useMemo(
    () => visibleInstalled.map(toInstalledListModel),
    [visibleInstalled],
  );
  const downloadModels = useMemo(
    () => visibleDownloads.map(toDownloadListModel),
    [visibleDownloads],
  );

  const listModels =
    activeTab === "installed" ? installedModels : downloadModels;

  const effectiveSelectedId =
    selectedId && listModels.some((item) => item.id === selectedId)
      ? selectedId
      : (listModels[0]?.id ?? null);

  const selectedModel =
    listModels.find((item) => item.id === effectiveSelectedId) ?? null;

  const remoteItemCount =
    marketplaceState?.items.filter((item) => item.source === "remote").length ??
    0;

  const bundledCount = installedExtensions.filter(
    (extension) => extension.builtin,
  ).length;
  const managedCount = installedExtensions.length - bundledCount;

  const setActionMessage = useCallback((nextMessage: string, ok = true) => {
    setMessage(nextMessage);
    setMessageTone(ok ? "info" : "error");
  }, []);

  const reloadExtensionMarketplace = useCallback(async () => {
    if (!hasMarketplaceApi()) {
      setMarketplaceState({ items: [] });
      setActionMessage(
        "Extension downloads need the latest preload API. Restart Axon after this build so the install command is available.",
        false,
      );
      return;
    }

    try {
      setMarketplaceState(await window.axon.listExtensionMarketplace());
    } catch (err) {
      console.error("failed to load extension marketplace:", err);
      setActionMessage(
        `Failed to load extension downloads. ${getErrorMessage(err)}`,
        false,
      );
    }
  }, [setActionMessage]);

  const reloadExtensions = async () => {
    setBusyAction("reload");
    setMessage(null);
    setConfirmingUninstallId(null);
    try {
      const result = await window.axon.reloadExtensions(folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
      if (activeTab === "downloads") await reloadExtensionMarketplace();
    } catch (err) {
      console.error("failed to reload extensions:", err);
      setActionMessage(`Failed to reload extensions. ${getErrorMessage(err)}`, false);
    } finally {
      setBusyAction(null);
    }
  };

  const openExtensionsFolder = async () => {
    setBusyAction("folder");
    setMessage(null);
    try {
      const result = await window.axon.openExtensionsFolder(folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
    } catch (err) {
      console.error("failed to open extensions folder:", err);
      setActionMessage(
        `Failed to open extensions folder. ${getErrorMessage(err)}`,
        false,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const toggleExtension = async (extensionId: string, enabled: boolean) => {
    setBusyAction(extensionId);
    setMessage(null);
    try {
      const result = await window.axon.setExtensionEnabled(
        extensionId,
        enabled,
        folderPath,
      );
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
    } catch (err) {
      console.error("failed to update extension state:", err);
      setActionMessage(
        `Failed to update extension. ${getErrorMessage(err)}`,
        false,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const requestUninstall = (extensionId: string | null) => {
    setConfirmingUninstallId((current) =>
      extensionId && current === extensionId ? null : extensionId,
    );
  };

  const uninstallExtension = async (extensionId: string) => {
    setBusyAction(extensionId);
    setMessage(null);
    setConfirmingUninstallId(null);
    try {
      const result = await window.axon.uninstallExtension(extensionId, folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
      await reloadExtensionMarketplace();
    } catch (err) {
      console.error("failed to uninstall extension:", err);
      setActionMessage(
        `Failed to uninstall extension. ${getErrorMessage(err)}`,
        false,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const installExtensionPackage = async (extensionId: string) => {
    if (!hasMarketplaceApi()) {
      setActionMessage(
        "Extension downloads need the latest preload API. Restart Axon after this build so the install command is available.",
        false,
      );
      return;
    }

    setBusyAction(`download:${extensionId}`);
    setMessage(null);
    try {
      const result = await window.axon.installExtension(extensionId, folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
      await reloadExtensionMarketplace();
    } catch (err) {
      console.error("failed to install extension:", err);
      setActionMessage(`Failed to install extension. ${getErrorMessage(err)}`, false);
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    setConfirmingUninstallId(null);
    setSelectedId(null);
  }, [activeTab, searchQuery]);

  useEffect(() => {
    if (activeTab === "downloads" && !marketplaceState) {
      void reloadExtensionMarketplace();
    }
  }, [activeTab, marketplaceState, reloadExtensionMarketplace]);

  const registry = extensionState?.contributionRegistry;
  const registrySummary = registry
    ? [
        ["commands", registry.commands.length],
        ["themes", registry.themes.length],
        ["languages", registry.languages.length],
      ].filter(([, count]) => Number(count) > 0)
    : [];

  const renderList = () => {
    if (activeTab === "installed") {
      if (installedExtensions.length === 0) {
        return (
          <div className="flex items-center justify-center px-6 py-10 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            No extensions loaded.
          </div>
        );
      }

      if (listModels.length === 0) {
        return (
          <div className="flex items-center justify-center px-6 py-10 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            <div>
              <PackageX size={22} className="mx-auto mb-2 opacity-50" />
              {searchQuery
                ? `Nothing matches "${searchQuery}".`
                : showBundled
                  ? "No extensions to show."
                  : "No user-installed extensions yet."}
            </div>
          </div>
        );
      }
    } else if (!marketplaceState) {
      return (
        <div className="flex items-center justify-center px-6 py-10 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
          Loading extension downloads.
        </div>
      );
    }

    return listModels.map((item) => (
      <ExtensionListItem
        key={item.id}
        item={item}
        selected={item.id === effectiveSelectedId}
        onSelect={setSelectedId}
      />
    ));
  };

  const renderDetailPlaceholder = (): React.ReactNode => {
    if (activeTab === "downloads" && !marketplaceState) {
      return (
        <div className="flex flex-col items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-50">
          <RefreshCw size={20} className="animate-spin" />
          Loading the extension registry…
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-50">
        <Blocks size={20} className="opacity-50" />
        {searchQuery
          ? "No extensions match your search."
          : activeTab === "installed"
            ? "Select an installed extension to see its details."
            : "Select an extension to install."}
      </div>
    );
  };

  return (
    <CommandModal
      title="extensions"
      onClose={onClose}
      width="w-[min(1240px,calc(100vw-2rem))]"
      bodyClassName="flex min-h-0 flex-1 overflow-hidden"
      panelStyle={{
        height: "min(860px, calc(100vh - 3rem))",
        minHeight: "min(680px, calc(100vh - 3rem))",
      }}
    >
      <div className="flex h-full min-h-0 w-full flex-col bg-transparent">
        <div className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-[var(--axon-editor-foreground)]">
              <Blocks size={16} className="text-[var(--axon-syntax-function)]" />
              Extensions
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openExtensionsFolder()}
                disabled={busyAction !== null}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-default disabled:opacity-60"
              >
                <FolderOpen size={13} />
                Folder
              </button>
              <button
                type="button"
                onClick={() => void reloadExtensions()}
                disabled={busyAction !== null}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-default disabled:opacity-60"
              >
                <RefreshCw
                  size={13}
                  className={busyAction === "reload" ? "animate-spin" : ""}
                />
                Reload
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3">
            <Search
              size={14}
              className="shrink-0 text-[var(--axon-syntax-function)] opacity-70"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search extensions by name, publisher, or id"
              spellCheck={false}
              autoFocus
              className="h-9 w-full bg-transparent text-[13px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-40"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex w-fit rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-1">
              {(["installed", "downloads"] as ExtensionTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex h-8 cursor-pointer items-center gap-1.5 rounded px-3 text-[12px] capitalize transition-colors ${
                    activeTab === tab
                      ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                      : "text-[var(--axon-editor-foreground)] opacity-55 hover:opacity-90"
                  }`}
                >
                  {tab}
                  <span className="rounded bg-[var(--axon-editor-background)] px-1 text-[10px] opacity-70">
                    {tab === "installed"
                      ? managedCount
                      : marketplaceState?.items.length ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {activeTab === "installed" && bundledCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowBundled((current) => !current)}
                className={`flex h-8 cursor-pointer items-center gap-2 rounded border px-2 text-[11px] transition-colors ${
                  showBundled
                    ? "border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                    : "border-[var(--axon-panel-border)] text-[var(--axon-editor-foreground)] opacity-55 hover:opacity-90"
                }`}
              >
                <ShieldCheck size={11} />
                {bundledCount} bundled
              </button>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px]">
              <span className="rounded bg-[#152019] px-2 py-1 text-[#8fe3a2]">
                {extensionState?.hostStatus.safeMode !== false
                  ? "safe declarative mode"
                  : "extension code enabled"}
              </span>
              {activeTab === "downloads" && remoteItemCount > 0 ? (
                <span className="rounded bg-[#152e3d] px-2 py-1 text-[#8fb5d1]">
                  {remoteItemCount} remote
                </span>
              ) : null}
              {activeTab === "downloads" && marketplaceState?.remoteError ? (
                <span
                  title={marketplaceState.remoteError}
                  className="rounded bg-[#2c2414] px-2 py-1 text-[#ffd580]"
                >
                  registry unreachable
                </span>
              ) : null}
              {registrySummary.slice(0, 3).map(([label, count]) => (
                <span
                  key={label}
                  className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[var(--axon-editor-foreground)] opacity-55"
                >
                  {count} {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]">
            {renderList()}
          </aside>

          <section className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-transparent">
            <ExtensionDetailPanel
              item={selectedModel}
              variant={activeTab === "installed" ? "installed" : "download"}
              placeholder={renderDetailPlaceholder()}
              busy={busyAction !== null}
              confirmingUninstall={
                selectedModel !== null &&
                confirmingUninstallId === selectedModel.id
              }
              onToggle={(extensionId, enabled) =>
                void toggleExtension(extensionId, enabled)
              }
              onRequestUninstall={(extensionId) => requestUninstall(extensionId)}
              onConfirmUninstall={(extensionId) =>
                void uninstallExtension(extensionId)
              }
              onOpen={(extensionId) => {
                onOpenWebview(extensionId);
                onClose();
              }}
              onInstall={(extensionId) =>
                void installExtensionPackage(extensionId)
              }
            />
          </section>
        </div>

        {message ? (
          <div
            className={`flex shrink-0 items-start gap-2 border-t px-5 py-2.5 text-[11px] ${
              messageTone === "error"
                ? "border-[#3a2024] bg-[#1b0f13] text-[#ff9aa2]"
                : "border-[#1d3443] bg-[#0d1d26] text-[var(--axon-syntax-function)]"
            }`}
          >
            {messageTone === "error" ? (
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        ) : null}
      </div>
    </CommandModal>
  );
}