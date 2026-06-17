import { useState } from "react";
import {
  Blocks,
  CheckCircle2,
  Cpu,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { type ExtensionState } from "../../../shared/extensions";
import CommandModal from "../../shared/components/CommandModal";
import { SettingsToggle } from "../settings/SettingsControls";

interface Props {
  folderPath: string | null;
  extensionState: ExtensionState | null;
  onExtensionsChanged: (state: ExtensionState) => void;
  onClose: () => void;
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown extension error.";
}

export default function ExtensionsModal({
  folderPath,
  extensionState,
  onExtensionsChanged,
  onClose,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const setActionMessage = (nextMessage: string, ok = true) => {
    setMessage(nextMessage);
    setMessageTone(ok ? "info" : "error");
  };

  const reloadExtensions = async () => {
    setBusyAction("reload");
    setMessage(null);
    try {
      const result = await window.axon.reloadExtensions(folderPath);
      onExtensionsChanged(result.state);
      setActionMessage(result.message, result.ok);
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

  return (
    <CommandModal
      title="extensions"
      onClose={onClose}
      width="w-[920px]"
      bodyClassName="min-h-0 overflow-auto"
    >
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-[#222838] bg-[#0b0d13] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#dce4f0]">
                <Blocks size={15} className="text-[#80c8e0]" />
                Local extension host
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="rounded bg-[#152019] px-2 py-1 text-[#8fe3a2]">
                  {extensionState?.hostStatus.safeMode !== false
                    ? "safe declarative mode"
                    : "extension code enabled"}
                </span>
                <span className="rounded bg-[#151923] px-2 py-1 text-[#8f98aa]">
                  host: {extensionState?.hostStatus.mode ?? "loading"}
                </span>
              </div>
              <div className="mt-2 max-w-2xl text-[11px] leading-5 text-[#7f8aa3]">
                {extensionState?.hostStatus.message ??
                  "Axon is loading extension metadata."}
              </div>
              {extensionState?.availableActivationEvents.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {extensionState.availableActivationEvents.map((eventName) => (
                    <span
                      key={eventName}
                      className="rounded bg-[#101723] px-2 py-1 text-[10px] text-[#647086]"
                    >
                      {eventName}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 space-y-1 font-mono text-[10px] text-[#647086]">
                <div className="truncate">
                  workspace:{" "}
                  {extensionState?.workspaceExtensionsPath ??
                    "open a workspace to enable .axon/extensions"}
                </div>
                <div className="truncate">
                  user:{" "}
                  {extensionState?.userExtensionsPath ??
                    "created in Axon's app data folder"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void reloadExtensions()}
                disabled={busyAction !== null}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#2a3346] bg-[#1e2430] px-3 text-[12px] text-[#c8d0e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-default disabled:opacity-60"
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
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#2a3346] bg-[#1e2430] px-3 text-[12px] text-[#c8d0e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-default disabled:opacity-60"
              >
                <FolderOpen size={13} />
                Folder
              </button>
            </div>
          </div>

          {message ? (
            <div
              className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] ${
                messageTone === "error"
                  ? "border-[#3a2024] bg-[#1b0f13] text-[#ff9aa2]"
                  : "border-[#1d3443] bg-[#0d1d26] text-[#80c8e0]"
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

        {!extensionState || extensionState.extensions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#222838] px-4 py-10 text-center text-[12px] text-[#586478]">
            No extensions loaded yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {extensionState.extensions.map((extension) => {
              const contributionCounts = [
                ["themes", extension.contributes.themes.length],
                ["commands", extension.contributes.commands.length],
                ["languages", extension.contributes.languages.length],
                ["snippets", extension.contributes.snippets.length],
                ["icons", extension.contributes.icons.length],
                ["views", extension.contributes.views.length],
                ["tasks", extension.contributes.taskProviders.length],
                ["debuggers", extension.contributes.debuggerProviders.length],
                ["language packs", extension.contributes.languagePacks.length],
              ].filter(([, count]) => Number(count) > 0);

              return (
                <div
                  key={extension.id}
                  className="rounded-lg border border-[#222838] bg-[#0b0d13] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-[#dce4f0]">
                          {extension.name}
                        </span>
                        <span className="rounded bg-[#151923] px-1.5 py-0.5 text-[10px] text-[#647086]">
                          {extension.version}
                        </span>
                        <span className="rounded bg-[#142a36] px-1.5 py-0.5 text-[10px] text-[#80c8e0]">
                          {extension.source}
                        </span>
                        {extension.builtin ? (
                          <span className="flex items-center gap-1 rounded bg-[#152019] px-1.5 py-0.5 text-[10px] text-[#8fe3a2]">
                            <ShieldCheck size={10} />
                            protected
                          </span>
                        ) : null}
                        <span
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                            extension.lifecycle === "active"
                              ? "bg-[#152019] text-[#8fe3a2]"
                              : extension.lifecycle === "error"
                                ? "bg-[#341b20] text-[#ff8b92]"
                                : "bg-[#151923] text-[#647086]"
                          }`}
                        >
                          <Cpu size={10} />
                          {extension.lifecycle}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#647086]">
                        {extension.publisher} / {extension.id}
                      </div>
                      {extension.description ? (
                        <div className="mt-2 max-w-2xl text-[12px] leading-5 text-[#9aa4b8]">
                      {extension.description}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[#647086]">
                        <span className="rounded bg-[#151923] px-2 py-1">
                          host: {extension.hostKind}
                        </span>
                        <span className="rounded bg-[#151923] px-2 py-1">
                          activation: {extension.activationReason}
                        </span>
                      </div>
                    </div>
                    <SettingsToggle
                      checked={extension.enabled}
                      disabled={extension.builtin || busyAction !== null}
                      onChange={(checked) =>
                        void toggleExtension(extension.id, checked)
                      }
                      label={extension.enabled ? "Enabled" : "Disabled"}
                    />
                  </div>

                  

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {contributionCounts.length === 0 ? (
                      <span className="rounded bg-[#151923] px-2 py-1 text-[10px] text-[#586478]">
                        no contributions
                      </span>
                    ) : (
                      contributionCounts.map(([label, count]) => (
                        <span
                          key={`${extension.id}:${label}`}
                          className="rounded bg-[#151923] px-2 py-1 text-[10px] text-[#8f98aa]"
                        >
                          {count} {label}
                        </span>
                      ))
                    )}
                    {extension.themes.map((theme) => (
                      <span
                        key={theme.id}
                        className="rounded bg-[#1d2535] px-2 py-1 text-[10px] text-[#dce4f0]"
                      >
                        theme: {theme.label}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 truncate font-mono text-[10px] text-[#3f485a]">
                    {extension.path}
                  </div>

                  {extension.errors.length > 0 ? (
                    <div className="mt-3 space-y-1 rounded-md border border-[#3a2024] bg-[#1b0f13] px-3 py-2">
                      {extension.errors.map((error) => (
                        <div
                          key={`${extension.id}:${error}`}
                          className="text-[11px] text-[#ff9aa2]"
                        >
                          {error}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CommandModal>
  );
}
