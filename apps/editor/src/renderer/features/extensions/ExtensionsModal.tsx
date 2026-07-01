import { useEffect, useMemo, useState } from "react";
import {
  Blocks,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  type ExtensionInfo,
  type ExtensionMarketplaceItem,
  type ExtensionMarketplaceState,
  type ExtensionState,
} from "../../../shared/extensions";
import CommandModal from "../../shared/components/CommandModal";

interface Props {
  folderPath: string | null;
  extensionState: ExtensionState | null;
  onExtensionsChanged: (state: ExtensionState) => void;
  onClose: () => void;
}

type ExtensionTab = "installed" | "downloads";

interface ExtensionSummary {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  source: ExtensionInfo["source"];
  repositoryUrl: string | null;
  homepageUrl: string | null;
  kind: ExtensionInfo["kind"];
  enabled: boolean;
  builtin: boolean;
  lifecycle: ExtensionInfo["lifecycle"];
  contributionCount: number;
  themeLabels: string[];
  errors: string[];
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown extension error.";
}

function hasThemeMarketplaceApi() {
  return (
    (typeof window.axon.listExtensionMarketplace === "function" ||
      typeof window.axon.listThemeMarketplace === "function") &&
    (typeof window.axon.installExtension === "function" ||
      typeof window.axon.installThemeExtension === "function")
  );
}

function getContributionCount(extension: ExtensionInfo) {
  return (
    extension.contributes.themes.length +
    extension.contributes.commands.length +
    extension.contributes.languages.length +
    extension.contributes.snippets.length +
    extension.contributes.icons.length +
    extension.contributes.views.length +
    extension.contributes.taskProviders.length +
    extension.contributes.debuggerProviders.length +
    extension.contributes.languagePacks.length
  );
}

function summarizeExtension(extension: ExtensionInfo): ExtensionSummary {
  return {
    id: extension.id,
    name: extension.name,
    publisher: extension.publisher,
    version: extension.version,
    description: extension.description,
    source: extension.source,
    repositoryUrl: extension.repositoryUrl,
    homepageUrl: extension.homepageUrl,
    kind: extension.kind,
    enabled: extension.enabled,
    builtin: extension.builtin,
    lifecycle: extension.lifecycle,
    contributionCount: getContributionCount(extension),
    themeLabels: extension.themes.map((theme) => theme.label),
    errors: extension.errors,
  };
}

function MiniToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span
        className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${
          checked
            ? "border-[#5f8298] bg-[#315f77]"
            : "border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]"
        }`}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-4 bg-[#c8d7df]"
              : "translate-x-0 bg-[#747982]"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

function StatusPill({ extension }: { extension: ExtensionSummary }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] ${
        extension.lifecycle === "active"
          ? "bg-[#152019] text-[#8fe3a2]"
          : extension.lifecycle === "error"
            ? "bg-[#341b20] text-[#ff8b92]"
            : "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-55"
      }`}
    >
      {extension.lifecycle}
    </span>
  );
}

function SourceLinkButton({ href }: { href: string | null }) {
  if (!href) return null;

  return (
    <button
      type="button"
      onClick={() => void window.axon.openExternalLink(href)}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-70 transition-colors hover:border-[var(--axon-syntax-function)] hover:opacity-100"
    >
      <ExternalLink size={12} />
      Source
    </button>
  );
}

function InstalledExtensionRow({
  extension,
  busy,
  onToggle,
}: {
  extension: ExtensionSummary;
  busy: boolean;
  onToggle: (extensionId: string, enabled: boolean) => void;
}) {
  return (
    <div className="border-b border-[var(--axon-panel-border)] px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
              {extension.name}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
              {extension.version}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-syntax-function)]">
              {extension.source}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-65">
              {extension.kind}
            </span>
            {extension.builtin ? (
              <span className="inline-flex items-center gap-1 rounded bg-[#152019] px-1.5 py-0.5 text-[10px] text-[#8fe3a2]">
                <ShieldCheck size={10} />
                built-in
              </span>
            ) : null}
            <StatusPill extension={extension} />
          </div>

          <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
            {extension.publisher} / {extension.id}
          </div>

          {extension.description ? (
            <div className="mt-2 max-w-2xl text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
              {extension.description}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
              {extension.contributionCount} contributions
            </span>
            {extension.themeLabels.slice(0, 3).map((label) => (
              <span
                key={`${extension.id}:${label}`}
                className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-65"
              >
                {label}
              </span>
            ))}
            {extension.themeLabels.length > 3 ? (
              <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                +{extension.themeLabels.length - 3}
              </span>
            ) : null}
          </div>

          {extension.errors.length > 0 ? (
            <div className="mt-2 text-[11px] text-[#ff9aa2]">
              {extension.errors[0]}
            </div>
          ) : null}
        </div>

        <MiniToggle
          checked={extension.enabled}
          disabled={extension.builtin || busy}
          label={extension.enabled ? "Enabled" : "Disabled"}
          onChange={(checked) => onToggle(extension.id, checked)}
        />
        <SourceLinkButton href={extension.repositoryUrl ?? extension.homepageUrl} />
      </div>
    </div>
  );
}

function DownloadRow({
  item,
  busyAction,
  onInstall,
}: {
  item: ExtensionMarketplaceItem;
  busyAction: string | null;
  onInstall: (extensionId: string) => void;
}) {
  const installing = busyAction === `download:${item.id}`;

  return (
    <div className="border-b border-[var(--axon-panel-border)] px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">
              {item.name}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
              {item.version}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-syntax-function)]">
              {item.publisher}
            </span>
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-65">
              {item.kind}
            </span>
          </div>
          <div className="mt-2 max-w-2xl text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
            {item.description}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.contributionLabels.map((label) => (
              <span
                key={`${item.id}:${label}`}
                className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-65"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onInstall(item.id)}
          disabled={item.installed || busyAction !== null}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-default disabled:opacity-55"
        >
          {item.installed ? (
            <PackageCheck size={13} />
          ) : (
            <Download size={13} className={installing ? "animate-pulse" : ""} />
          )}
          {item.installed ? "Installed" : installing ? "Installing" : "Download"}
        </button>
        <SourceLinkButton href={item.repositoryUrl ?? item.homepageUrl} />
      </div>
    </div>
  );
}

export default function ExtensionsModal({
  folderPath,
  extensionState,
  onExtensionsChanged,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<ExtensionTab>("installed");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [marketplaceState, setMarketplaceState] =
    useState<ExtensionMarketplaceState | null>(null);

  const installedExtensions = useMemo(
    () => (extensionState?.extensions ?? []).map(summarizeExtension),
    [extensionState],
  );

  const setActionMessage = (nextMessage: string, ok = true) => {
    setMessage(nextMessage);
    setMessageTone(ok ? "info" : "error");
  };

  const reloadThemeMarketplace = async () => {
    if (!hasThemeMarketplaceApi()) {
      setMarketplaceState({ items: [] });
      setActionMessage(
        "Extension downloads need the latest preload API. Restart Axon after this build so the install command is available.",
        false,
      );
      return;
    }

    try {
      const listMarketplace =
        window.axon.listExtensionMarketplace ?? window.axon.listThemeMarketplace;
      setMarketplaceState(await listMarketplace());
    } catch (err) {
      console.error("failed to load theme marketplace:", err);
      setActionMessage(
        `Failed to load extension downloads. ${getErrorMessage(err)}`,
        false,
      );
    }
  };

  const reloadExtensions = async () => {
    setBusyAction("reload");
    setMessage(null);
    try {
      const result = await window.axon.reloadExtensions(folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
      if (activeTab === "downloads") await reloadThemeMarketplace();
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

  const installThemeExtension = async (extensionId: string) => {
    if (!hasThemeMarketplaceApi()) {
      setActionMessage(
        "Extension downloads need the latest preload API. Restart Axon after this build so the install command is available.",
        false,
      );
      return;
    }

    setBusyAction(`download:${extensionId}`);
    setMessage(null);
    try {
      const installExtension =
        window.axon.installExtension ?? window.axon.installThemeExtension;
      const result = await installExtension(extensionId, folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
      await reloadThemeMarketplace();
    } catch (err) {
      console.error("failed to install theme extension:", err);
      setActionMessage(`Failed to install extension. ${getErrorMessage(err)}`, false);
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    if (activeTab === "downloads" && !marketplaceState) {
      void reloadThemeMarketplace();
    }
  }, [activeTab, marketplaceState]);

  return (
    <CommandModal
      title="extensions"
      onClose={onClose}
      width="w-[min(860px,calc(100vw-2rem))]"
      bodyClassName="min-h-0 overflow-hidden"
      blurOverlay={false}
    >
      <div className="flex h-[min(640px,calc(100vh-7rem))] min-h-0 flex-col bg-[var(--axon-panel-background)]">
        <div className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--axon-editor-foreground)]">
                <Blocks size={15} className="text-[var(--axon-syntax-function)]" />
                Extensions
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="rounded bg-[#152019] px-2 py-1 text-[#8fe3a2]">
                  {extensionState?.hostStatus.safeMode !== false
                    ? "safe declarative mode"
                    : "extension code enabled"}
                </span>
                <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[var(--axon-editor-foreground)] opacity-55">
                  {installedExtensions.length} installed
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => void openExtensionsFolder()}
                disabled={busyAction !== null}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-default disabled:opacity-60"
              >
                <FolderOpen size={13} />
                Folder
              </button>
            </div>
          </div>

          <div className="mt-3 flex w-fit rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-1">
            {(["installed", "downloads"] as ExtensionTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-8 cursor-pointer rounded px-3 text-[12px] capitalize transition-colors ${
                  activeTab === tab
                    ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                    : "text-[var(--axon-editor-foreground)] opacity-55 hover:opacity-90"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {message ? (
            <div
              className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] ${
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

        <div className="min-h-0 flex-1 overflow-auto">
          {activeTab === "installed" ? (
            installedExtensions.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                No extensions loaded.
              </div>
            ) : (
              installedExtensions.map((extension) => (
                <InstalledExtensionRow
                  key={extension.id}
                  extension={extension}
                  busy={busyAction !== null}
                  onToggle={(extensionId, enabled) =>
                    void toggleExtension(extensionId, enabled)
                  }
                />
              ))
            )
          ) : !marketplaceState ? (
            <div className="px-4 py-8 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
              Loading theme downloads.
            </div>
          ) : marketplaceState.items.length === 0 ? (
            <div className="px-4 py-8 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
              No downloadable themes are available in this build.
            </div>
          ) : (
            marketplaceState.items.map((item) => (
              <DownloadRow
                key={item.id}
                item={item}
                busyAction={busyAction}
                onInstall={(extensionId) => void installThemeExtension(extensionId)}
              />
            ))
          )}
        </div>
      </div>
    </CommandModal>
  );
}
