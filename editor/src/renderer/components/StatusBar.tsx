// src/renderer/components/StatusBar.tsx
// Bottom status bar showing active file language, cursor position, encoding.
// Left side has sidebar toggle and folder name.
// Right side has terminal toggle, language, cursor position.
import {
  AlertCircle,
  FileCode,
  GitBranch,
  ListChecks,
  PanelLeft,
  TerminalSquare,
  Download,
} from "lucide-react";
import Tooltip from "./Tooltip";
import { type BottomPanelTab } from "./BottomPanel";
import { type ResolvedThemeTokens } from "../lib/themeTokens";
import { type UpdateInfo } from "../../shared/updates";

interface Props {
  activeFile: string | null;
  language: string;
  cursor: { line: number; col: number };
  folderName: string | null;
  sidebarCollapsed: boolean;
  terminalOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  problemCount: number;
  gitBranch: string | null;
  gitChangeCount: number;
  updateInfo: UpdateInfo | null;
  themeTokens: ResolvedThemeTokens;
  onToggleSidebar: () => void;
  onToggleTerminal: () => void;
  onOpenBottomPanel: (tab: BottomPanelTab) => void;
  onOpenSourceControl: () => void;
  onOpenUpdatePage: () => void;
}

export default function StatusBar({
  activeFile,
  language,
  cursor,
  folderName,
  sidebarCollapsed,
  terminalOpen,
  bottomPanelOpen,
  bottomPanelTab,
  problemCount,
  gitBranch,
  gitChangeCount,
  updateInfo,
  themeTokens,
  onToggleSidebar,
  onToggleTerminal,
  onOpenBottomPanel,
  onOpenSourceControl,
  onOpenUpdatePage,
}: Props) {
  return (
    <div
      className="h-7 border-t flex items-center px-2 text-[11px] text-[#586478] shrink-0 gap-1"
      style={{
        background: themeTokens["status_bar.background"],
        borderColor: "var(--axon-panel-border)",
      }}
    >
      <Tooltip label="Toggle sidebar" side="top">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className={`flex items-center justify-center w-6 h-5 rounded transition-colors cursor-pointer
          ${sidebarCollapsed ? "text-[#586478] hover:text-[#80c8e0]" : "text-[#80c8e0]"}`}
        >
          <PanelLeft size={13} />
        </button>
      </Tooltip>

      {folderName && (
        <span className="text-[#9aa4b8] px-1 font-medium">{folderName}</span>
      )}

      {gitBranch && (
        <Tooltip label="Source control" side="top">
          <button
            onClick={onOpenSourceControl}
            aria-label="Source control"
            className="flex h-5 cursor-pointer items-center gap-1 rounded px-2 text-[#586478] transition-colors hover:text-[#80c8e0]"
          >
            <GitBranch size={12} />
            <span className="max-w-32 truncate">{gitBranch}</span>
            {gitChangeCount > 0 && (
              <span className="text-[#80c8e0]">{gitChangeCount}</span>
            )}
          </button>
        </Tooltip>
      )}

      <div className="ml-auto flex items-center gap-1">
        {updateInfo?.updateAvailable && (
          <Tooltip
            label={`Update to Axon ${updateInfo.latestVersion}`}
            side="top"
          >
            <button
              onClick={onOpenUpdatePage}
              aria-label={`Update to Axon ${updateInfo.latestVersion}`}
              className="flex h-5 cursor-pointer items-center gap-1 rounded border border-[#2a3346] bg-[#142a36] px-2 text-[#80c8e0] transition-colors hover:border-[#80c8e0] hover:text-white"
            >
              <Download size={11} />
              Update
            </button>
          </Tooltip>
        )}

        {activeFile && (
          <>
            <span className="flex items-center gap-1 px-2 text-[#9aa4b8]">
              <FileCode size={11} />
              {language}
            </span>
            <span className="px-2 text-[#586478]">UTF-8</span>
            <span className="px-2 text-[#586478]">
              Ln {cursor.line}, Col {cursor.col}
            </span>
          </>
        )}

        <Tooltip label="Problems" side="top">
          <button
            onClick={() => onOpenBottomPanel("problems")}
            aria-label="Problems"
            className={`flex items-center gap-1 rounded px-2 h-5 transition-colors cursor-pointer
            ${bottomPanelOpen && bottomPanelTab === "problems" ? "text-[#80c8e0]" : "text-[#586478] hover:text-[#80c8e0]"}`}
          >
            <AlertCircle size={12} />
            {problemCount}
          </button>
        </Tooltip>

        <Tooltip label="Output" side="top">
          <button
            onClick={() => onOpenBottomPanel("output")}
            aria-label="Output"
            className={`flex items-center justify-center w-6 h-5 rounded transition-colors cursor-pointer
            ${bottomPanelOpen && bottomPanelTab === "output" ? "text-[#80c8e0]" : "text-[#586478] hover:text-[#80c8e0]"}`}
          >
            <ListChecks size={13} />
          </button>
        </Tooltip>

        <Tooltip label="Toggle terminal (Cmd+J)" side="top">
          <button
            onClick={onToggleTerminal}
            aria-label="Toggle terminal"
            className={`flex items-center justify-center w-6 h-5 rounded transition-colors cursor-pointer ml-1
            ${terminalOpen ? "text-[#80c8e0]" : "text-[#586478] hover:text-[#80c8e0]"}`}
          >
            <TerminalSquare size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
