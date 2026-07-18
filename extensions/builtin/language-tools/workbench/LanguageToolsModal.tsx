import { useCallback, useEffect, useState } from "react";
import {
  Braces,
  Download,
  FileCode2,
  GitPullRequestArrow,
  Languages,
  LocateFixed,
  RefreshCw,
  Replace,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { type LanguageServerStatus } from "@axon-editor/shared/lsp";
import {
  type ManagedLanguageToolProgress,
  type ManagedLanguageToolStatus,
} from "@axon-editor/shared/languageTools";
import { type FileSymbol } from "@axon-editor/renderer/features/sidebar/files/lib/fileSymbols";
import {
  enableManagedLanguageToolPrompt,
  isManagedLanguageToolPromptDisabled,
} from "@axon-editor/renderer/features/languageTools/languageToolPreferences";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

interface Props {
  open: boolean;
  folderPath: string | null;
  activeFile: string | null;
  language: string;
  symbols: FileSymbol[];
  onClose: () => void;
  onGoToDefinition: () => void;
  onFindReferences: () => void;
  onRename: () => void;
  onFormat: () => void;
  onOpenOutline: () => void;
}

function statusClass(status: LanguageServerStatus["status"]) {
  if (status === "running") return "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]";
  if (status === "available") return "bg-[#18261d] text-[#90c8a0]";
  if (status === "failed") return "bg-[#321b1f] text-[#ff9aa2]";
  return "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-45";
}

export default function LanguageToolsModal({
  open,
  folderPath,
  activeFile,
  language,
  symbols,
  onClose,
  onGoToDefinition,
  onFindReferences,
  onRename,
  onFormat,
  onOpenOutline,
}: Props) {
  const [servers, setServers] = useState<LanguageServerStatus[]>([]);
  const [managedTool, setManagedTool] =
    useState<ManagedLanguageToolStatus | null>(null);
  const [managedProgress, setManagedProgress] =
    useState<ManagedLanguageToolProgress | null>(null);
  const [managedToolError, setManagedToolError] = useState<string | null>(null);
  const [installingManagedTool, setInstallingManagedTool] = useState(false);
  const [managedPromptDisabled, setManagedPromptDisabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!folderPath) {
      setServers([]);
      return;
    }
    setLoading(true);
    try {
      const [nextServers, nextManagedTool] = await Promise.all([
        window.axon.getLanguageServerStatus(folderPath),
        window.axon.getManagedLanguageToolStatusForLanguage(language),
      ]);
      setServers(nextServers);
      setManagedTool(nextManagedTool);
      setManagedPromptDisabled(
        nextManagedTool
          ? isManagedLanguageToolPromptDisabled(nextManagedTool.id)
          : false,
      );
    } finally {
      setLoading(false);
    }
  }, [folderPath, language]);

  useEffect(() => {
    if (!open) return;
    void refresh().catch((err) => {
      console.error("failed to load language tools:", err);
    });
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    return window.axon.onManagedLanguageToolProgress((event) => {
      setManagedProgress((current) =>
        !managedTool || event.id === managedTool.id ? event : current,
      );
    });
  }, [managedTool, open]);

  const installManagedTool = async () => {
    if (!folderPath || !managedTool) return;
    setInstallingManagedTool(true);
    setManagedToolError(null);
    try {
      const result = await window.axon.installManagedLanguageTool(
        managedTool.id,
      );
      setManagedTool(result.status);
      if (!result.ok) {
        setManagedToolError(result.message);
        return;
      }
      enableManagedLanguageToolPrompt(managedTool.id);
      setManagedPromptDisabled(false);
      await window.axon.startLanguageServerForLanguage({
        folderPath,
        languageId: managedTool.languages[0],
      });
      await refresh();
    } catch (error) {
      setManagedToolError(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingManagedTool(false);
    }
  };

  if (!open) return null;

  const relevantServers = servers.filter((server) => server.relevant);

  return (
    <div className="axon-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="axon-modal-panel flex max-h-[78vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-2xl">
        <div className="flex h-11 items-center justify-between border-b border-[var(--axon-panel-border)] px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--axon-editor-foreground)]">
            <Languages size={16} />
            Language tools
          </div>
          <Tooltip label="Close language tools" side="bottom">
            <button
              type="button"
              aria-label="Close language tools"
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
            >
              <X size={15} />
            </button>
          </Tooltip>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3 overflow-hidden p-3">
          <div className="space-y-2">
            <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase text-[var(--axon-editor-foreground)] opacity-55">
                <FileCode2 size={12} />
                Active file
              </div>
              <div className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
                {activeFile ?? "No active file"}
              </div>
              <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">{language}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                ["definition", LocateFixed, onGoToDefinition],
                ["references", GitPullRequestArrow, onFindReferences],
                ["rename", Replace, onRename],
                ["format", Braces, onFormat],
              ] satisfies Array<[string, LucideIcon, () => void]>).map(([label, Icon, action]) => (
                <button
                  key={label}
                  type="button"
                  disabled={!activeFile}
                  onClick={action}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 hover:border-[var(--axon-syntax-function)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenOutline}
              disabled={!activeFile}
              className="flex h-9 w-full cursor-pointer items-center gap-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 hover:border-[var(--axon-syntax-function)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Sparkles size={13} />
              file symbols
            </button>
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <section className="min-h-0 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]">
              <div className="flex h-9 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
                <div className="text-[11px] uppercase text-[var(--axon-editor-foreground)] opacity-55">
                  Language servers
                </div>
                <Tooltip label="Refresh language server status" side="bottom">
                  <button
                    type="button"
                    aria-label="Refresh language server status"
                    onClick={() => void refresh()}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
                  >
                    <RefreshCw
                      size={12}
                      className={loading ? "animate-spin" : ""}
                    />
                  </button>
                </Tooltip>
              </div>
              <div className="max-h-full overflow-y-auto p-2">
                {managedTool ? (
                  <div className="mb-2 rounded border border-[var(--axon-syntax-function)]/45 bg-[var(--axon-panel-overlay-hover)] px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
                        {managedTool.label} managed support
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          managedTool.installed
                            ? statusClass("running")
                            : statusClass("missing")
                        }`}
                      >
                        {managedTool.installed ? "installed" : "available"}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
                      {managedTool.detail}
                    </div>
                    {installingManagedTool && managedProgress ? (
                      <div className="mt-2 h-1 overflow-hidden rounded bg-[var(--axon-editor-background)]">
                        <div
                          className="h-full bg-[var(--axon-syntax-function)] transition-[width] duration-150"
                          style={{ width: `${managedProgress.percent ?? 18}%` }}
                        />
                      </div>
                    ) : null}
                    {managedToolError ? (
                      <div className="mt-2 text-[10px] leading-4 text-[#ff9aa2]">
                        {managedToolError}
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      {!managedTool.installed ? (
                        <button
                          type="button"
                          disabled={installingManagedTool || !managedTool.supported}
                          onClick={() => void installManagedTool()}
                          className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-syntax-function)] px-2 text-[10px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-editor-background)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download size={11} />
                          {installingManagedTool ? "Installing" : "Install"}
                        </button>
                      ) : null}
                      {managedPromptDisabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            enableManagedLanguageToolPrompt(managedTool.id);
                            setManagedPromptDisabled(false);
                          }}
                          className="h-7 cursor-pointer rounded px-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-60 hover:bg-[var(--axon-editor-background)] hover:opacity-100"
                        >
                          Enable recommendations
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {(relevantServers.length > 0 ? relevantServers : servers).map(
                  (server) => (
                    <div
                      key={server.id}
                      className="mb-1 rounded border border-[var(--axon-panel-border)] px-2 py-1.5 last:mb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
                          {server.label}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${statusClass(server.status)}`}
                        >
                          {server.status}
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                        {server.detail || server.command}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="min-h-0 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]">
              <div className="h-9 border-b border-[var(--axon-panel-border)] px-3 py-2 text-[11px] uppercase text-[var(--axon-editor-foreground)] opacity-55">
                Symbols
              </div>
              <div className="max-h-full overflow-y-auto p-2">
                {symbols.slice(0, 80).map((symbol) => (
                  <button
                    key={`${symbol.name}:${symbol.line}:${symbol.column}`}
                    type="button"
                    onClick={onOpenOutline}
                    className="mb-1 grid w-full grid-cols-[minmax(0,1fr)_54px] rounded px-2 py-1 text-left text-[11px] text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
                  >
                    <span className="truncate">{symbol.name}</span>
                    <span className="text-right text-[var(--axon-editor-foreground)] opacity-45">
                      {symbol.line}:{symbol.column}
                    </span>
                  </button>
                ))}
                {symbols.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
                    no symbols
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
