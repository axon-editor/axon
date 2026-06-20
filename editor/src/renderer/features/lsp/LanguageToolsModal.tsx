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
  if (status === "running") return "bg-[#14313d] text-[#80c8e0]";
  if (status === "available") return "bg-[#18261d] text-[#90c8a0]";
  if (status === "failed") return "bg-[#321b1f] text-[#ff9aa2]";
  return "bg-[#151923] text-[#647086]";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="flex max-h-[78vh] w-full max-w-3xl flex-col rounded-lg border border-[#222838] bg-[#0b0e15] shadow-2xl">
        <div className="flex h-11 items-center justify-between border-b border-[#222838] px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[#dce4f0]">
            <Languages size={16} />
            Language tools
          </div>
          <Tooltip label="Close language tools" side="bottom">
            <button
              type="button"
              aria-label="Close language tools"
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#647086] hover:bg-[#151923] hover:text-white"
            >
              <X size={15} />
            </button>
          </Tooltip>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3 overflow-hidden p-3">
          <div className="space-y-2">
            <div className="rounded border border-[#1b2130] bg-[#090c12] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase text-[#7a8498]">
                <FileCode2 size={12} />
                Active file
              </div>
              <div className="truncate text-[12px] text-[#dce4f0]">
                {activeFile ?? "No active file"}
              </div>
              <div className="mt-1 text-[11px] text-[#586478]">{language}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ["definition", LocateFixed, onGoToDefinition],
                ["references", GitPullRequestArrow, onFindReferences],
                ["rename", Replace, onRename],
                ["format", Braces, onFormat],
              ].map(([label, Icon, action]) => (
                <button
                  key={label as string}
                  type="button"
                  disabled={!activeFile}
                  onClick={action as () => void}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded border border-[#222838] bg-[#090c12] px-2 text-[11px] text-[#9aa4b8] hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:text-[#3f485a]"
                >
                  <Icon size={13} />
                  {label as string}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenOutline}
              disabled={!activeFile}
              className="flex h-9 w-full cursor-pointer items-center gap-2 rounded border border-[#222838] bg-[#090c12] px-2 text-[11px] text-[#9aa4b8] hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:text-[#3f485a]"
            >
              <Sparkles size={13} />
              file symbols
            </button>
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <section className="min-h-0 rounded border border-[#1b2130] bg-[#090c12]">
              <div className="flex h-9 items-center justify-between border-b border-[#1b2130] px-3">
                <div className="text-[11px] uppercase text-[#7a8498]">
                  Language servers
                </div>
                <Tooltip label="Refresh language server status" side="bottom">
                  <button
                    type="button"
                    aria-label="Refresh language server status"
                    onClick={() => void refresh()}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#151923] hover:text-white"
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
                      className="mb-1 rounded border border-[#151923] px-2 py-1.5 last:mb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] text-[#dce4f0]">
                          {server.label}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${statusClass(server.status)}`}
                        >
                          {server.status}
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-[#586478]">
                        {server.detail || server.command}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="min-h-0 rounded border border-[#1b2130] bg-[#090c12]">
              <div className="h-9 border-b border-[#1b2130] px-3 py-2 text-[11px] uppercase text-[#7a8498]">
                Symbols
              </div>
              <div className="max-h-full overflow-y-auto p-2">
                {symbols.slice(0, 80).map((symbol) => (
                  <button
                    key={`${symbol.name}:${symbol.line}:${symbol.column}`}
                    type="button"
                    onClick={onOpenOutline}
                    className="mb-1 grid w-full grid-cols-[minmax(0,1fr)_54px] rounded px-2 py-1 text-left text-[11px] text-[#9aa4b8] hover:bg-[#151923] hover:text-white"
                  >
                    <span className="truncate">{symbol.name}</span>
                    <span className="text-right text-[#586478]">
                      {symbol.line}:{symbol.column}
                    </span>
                  </button>
                ))}
                {symbols.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-[#465166]">
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
