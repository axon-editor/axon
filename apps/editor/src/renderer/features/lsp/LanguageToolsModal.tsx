import { useEffect, useState } from "react";
import {
  Braces,
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
import { type LanguageServerStatus } from "../../../shared/lsp";
import { type FileSymbol } from "../sidebar/files/lib/fileSymbols";
import Tooltip from "../../shared/components/Tooltip";

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
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!folderPath) {
      setServers([]);
      return;
    }
    setLoading(true);
    try {
      setServers(await window.axon.getLanguageServerStatus(folderPath));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh().catch((err) => {
      console.error("failed to load language tools:", err);
    });
  }, [open, folderPath]);

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
