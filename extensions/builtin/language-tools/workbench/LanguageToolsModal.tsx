import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  LoaderCircle,
  RefreshCw,
  ScrollText,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { type LanguageServerStatus } from "@axon-editor/shared/lsp";
import {
  type ManagedLanguageToolId,
  type ManagedLanguageToolProgress,
  type ManagedLanguageToolStatus,
} from "@axon-editor/shared/languageTools";
import { enableManagedLanguageToolPrompt } from "@axon-editor/renderer/features/languageTools/languageToolPreferences";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import {
  normalizeLanguage,
  serverMatchesLanguage,
} from "./lib/workspaceLanguageTools";

interface Props {
  open: boolean;
  folderPath: string | null;
  activeFile: string | null;
  language: string;
  onClose: () => void;
  onViewLogs: () => void;
}

type CatalogScope = "workspace" | "all";
type WorkspaceAction = "start" | "stop" | "restart";

function statusClass(status: LanguageServerStatus["status"]) {
  if (status === "running") {
    return "bg-[#15321f] text-[#90c8a0]";
  }
  if (status === "available") {
    return "bg-[#1c2636] text-[#9fb7e8]";
  }
  if (status === "failed") {
    return "bg-[#341b20] text-[#ff8b92]";
  }
  return "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-65";
}

export default function LanguageToolsModal({
  open,
  folderPath,
  activeFile,
  language,
  onClose,
  onViewLogs,
}: Props) {
  const [scope, setScope] = useState<CatalogScope>("workspace");
  const [servers, setServers] = useState<LanguageServerStatus[]>([]);
  const [managedTools, setManagedTools] = useState<ManagedLanguageToolStatus[]>(
    [],
  );
  const [progress, setProgress] = useState<ManagedLanguageToolProgress | null>(
    null,
  );
  const [installingTool, setInstallingTool] =
    useState<ManagedLanguageToolId | null>(null);
  const [workspaceAction, setWorkspaceAction] =
    useState<WorkspaceAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextServers, nextTools] = await Promise.all([
        folderPath
          ? scope === "workspace"
            ? window.axon.getWorkspaceLanguageServerStatus(folderPath, language)
            : window.axon.getLanguageServerStatus(folderPath)
          : Promise.resolve([]),
        window.axon.listManagedLanguageTools(),
      ]);
      setServers(nextServers);
      setManagedTools(nextTools);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [folderPath, language, scope]);

  useEffect(() => {
    if (!open) return;
    setScope("workspace");
    setMessage(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    return window.axon.onManagedLanguageToolProgress((event) => {
      setProgress(event);
    });
  }, [open]);

  const workspaceServers = useMemo(
    () =>
      servers.filter(
        (server) =>
          server.relevant ||
          server.running ||
          serverMatchesLanguage(server, language),
      ),
    [language, servers],
  );
  const visibleServers = scope === "workspace" ? workspaceServers : servers;
  const visibleServerIds = new Set(visibleServers.map((server) => server.id));
  const visibleTools = managedTools.filter(
    (tool) =>
      scope === "all" ||
      visibleServerIds.has(tool.id as LanguageServerStatus["id"]) ||
      tool.languages.some(
        (candidate) =>
          normalizeLanguage(candidate) === normalizeLanguage(language),
      ),
  );
  const toolsById = new Map(visibleTools.map((tool) => [tool.id, tool]));
  const standaloneTools = visibleTools.filter(
    (tool) => !servers.some((server) => server.id === tool.id),
  );

  const installTool = async (tool: ManagedLanguageToolStatus) => {
    setInstallingTool(tool.id);
    setMessage(null);
    try {
      const result = await window.axon.installManagedLanguageTool(tool.id);
      setMessage(result.message);
      if (result.ok && folderPath && tool.languages[0]) {
        enableManagedLanguageToolPrompt(tool.id);
        await window.axon.startLanguageServerForLanguage({
          folderPath,
          languageId: tool.languages[0],
        });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingTool(null);
      setProgress(null);
    }
  };

  const uninstallTool = async (tool: ManagedLanguageToolStatus) => {
    if (!folderPath || tool.requiredBy.length > 0) return;
    setInstallingTool(tool.id);
    setMessage(null);
    try {
      await window.axon.stopLanguageServers(folderPath);
      const result = await window.axon.uninstallManagedLanguageTool(tool.id);
      setMessage(result.message);
      await window.axon.startLanguageServers(folderPath);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingTool(null);
    }
  };

  const runWorkspaceAction = async (action: WorkspaceAction) => {
    if (!folderPath) return;
    setWorkspaceAction(action);
    setMessage(null);
    try {
      const result =
        action === "start"
          ? await window.axon.startLanguageServers(folderPath)
          : action === "stop"
            ? await window.axon.stopLanguageServers(folderPath)
            : await window.axon
                .stopLanguageServers(folderPath)
                .then(() => window.axon.startLanguageServers(folderPath));
      setMessage(result.message);
      setServers(result.servers);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceAction(null);
    }
  };

  if (!open) return null;

  const renderToolActions = (tool: ManagedLanguageToolStatus | undefined) => {
    if (!tool) return null;
    const busy = installingTool === tool.id;
    if (busy) {
      return (
        <button
          type="button"
          onClick={() =>
            void window.axon.cancelManagedLanguageToolInstall(tool.id)
          }
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[10px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
        >
          <LoaderCircle size={11} className="animate-spin" />
          Cancel
        </button>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <Tooltip
          label={
            !tool.supported
              ? tool.detail
              : tool.updateAvailable
                ? "Update"
                : tool.installed
                  ? "Repair"
                  : "Install"
          }
          side="top"
        >
          <button
            type="button"
            aria-label={
              !tool.supported
                ? tool.detail
                : tool.updateAvailable
                  ? "Update"
                  : tool.installed
                    ? "Repair"
                    : "Install"
            }
            onClick={() => void installTool(tool)}
            disabled={!tool.supported || installingTool !== null}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-syntax-function)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
          >
            {tool.installed ? <RefreshCw size={12} /> : <Download size={12} />}
          </button>
        </Tooltip>
        {tool.installed ? (
          <Tooltip label="Uninstall" side="top">
            <button
              type="button"
              aria-label="Uninstall"
              onClick={() => void uninstallTool(tool)}
              disabled={installingTool !== null || tool.requiredBy.length > 0}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#ff8b92] opacity-55 hover:bg-[#341b20] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
            >
              <Trash2 size={12} />
            </button>
          </Tooltip>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-x-0 bottom-8 top-0 z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute bottom-1 right-2 flex max-h-[min(620px,calc(100vh-52px))] w-[min(430px,calc(100vw-16px))] flex-col overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-2xl">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Zap size={14} className="text-[var(--axon-syntax-function)]" />
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                Language Tools
              </div>
              <div className="max-w-64 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                {activeFile ?? "No active file"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip label="Refresh" side="bottom">
              <button
                type="button"
                aria-label="Refresh"
                onClick={() => void refresh()}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              >
                <RefreshCw
                  size={12}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
            </Tooltip>
            <Tooltip label="Close" side="bottom">
              <button
                type="button"
                aria-label="Close language tools"
                onClick={onClose}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              >
                <X size={14} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
          <div className="flex rounded border border-[var(--axon-panel-border)] p-0.5">
            {(["workspace", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={`h-6 cursor-pointer rounded px-2.5 text-[10px] capitalize transition-colors ${
                  scope === value
                    ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                    : "text-[var(--axon-editor-foreground)] opacity-45 hover:opacity-80"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip label="Start workspace servers" side="bottom">
              <button
                type="button"
                aria-label="Start workspace servers"
                disabled={!folderPath || workspaceAction !== null}
                onClick={() => void runWorkspaceAction("start")}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-syntax-function)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <Zap size={12} />
              </button>
            </Tooltip>
            <Tooltip label="Restart workspace servers" side="bottom">
              <button
                type="button"
                aria-label="Restart workspace servers"
                disabled={!folderPath || workspaceAction !== null}
                onClick={() => void runWorkspaceAction("restart")}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <RefreshCw
                  size={12}
                  className={
                    workspaceAction === "restart" ? "animate-spin" : ""
                  }
                />
              </button>
            </Tooltip>
            <Tooltip label="Stop workspace servers" side="bottom">
              <button
                type="button"
                aria-label="Stop workspace servers"
                disabled={!folderPath || workspaceAction !== null}
                onClick={() => void runWorkspaceAction("stop")}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#ff8b92] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <Square size={11} />
              </button>
            </Tooltip>
            <Tooltip label="LSP logs" side="bottom">
              <button
                type="button"
                aria-label="Open LSP logs"
                onClick={onViewLogs}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              >
                <ScrollText size={12} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleServers.map((server) => {
            const tool = toolsById.get(server.id as ManagedLanguageToolId);
            return (
              <div
                key={server.id}
                className="mb-1 flex min-h-12 items-center gap-2 rounded border border-[var(--axon-panel-border)] px-2.5 py-2 last:mb-0"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    server.status === "running"
                      ? "bg-[#54d6b5]"
                      : server.status === "failed"
                        ? "bg-[#ff8b92]"
                        : "bg-[#586478]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                      {server.label}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] ${statusClass(server.status)}`}
                    >
                      {tool?.installed && server.status === "available"
                        ? "ready"
                        : server.status}
                    </span>
                    {serverMatchesLanguage(server, language) ? (
                      <span className="text-[9px] text-[var(--axon-syntax-function)]">
                        active
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                    {server.lastError ?? server.detail}
                  </div>
                  {installingTool === tool?.id && progress?.id === tool.id ? (
                    <div className="mt-1.5 h-1 overflow-hidden rounded bg-[var(--axon-panel-overlay-hover)]">
                      <div
                        className="h-full bg-[var(--axon-syntax-function)] transition-[width] duration-150"
                        style={{ width: `${progress.percent ?? 12}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                {renderToolActions(tool)}
              </div>
            );
          })}

          {standaloneTools.map((tool) => (
            <div
              key={tool.id}
              className="mb-1 flex min-h-12 items-center gap-2 rounded border border-[var(--axon-panel-border)] px-2.5 py-2 last:mb-0"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#586478]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                  {tool.label}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {tool.detail}
                </div>
              </div>
              {renderToolActions(tool)}
            </div>
          ))}

          {visibleServers.length === 0 && standaloneTools.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
              No workspace languages detected
            </div>
          ) : null}
        </div>

        {message ? (
          <div className="shrink-0 border-t border-[var(--axon-panel-border)] px-3 py-2 text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
            {message}
          </div>
        ) : null}

        {scope === "workspace" ? (
          <button
            type="button"
            onClick={() => setScope("all")}
            className="h-9 shrink-0 cursor-pointer border-t border-[var(--axon-panel-border)] px-3 text-left text-[10px] text-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
          >
            Browse all language tools
          </button>
        ) : null}
      </div>
    </div>
  );
}
