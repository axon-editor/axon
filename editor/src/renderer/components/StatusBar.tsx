// src/renderer/components/StatusBar.tsx
// Bottom status bar showing active file language, cursor position, encoding.
// Left side has sidebar toggle and the workspace switcher.
// Right side has terminal toggle, language, cursor position.
import {
  AlertCircle,
  FileCode,
  GitBranch,
  ListChecks,
  PanelLeft,
  Search,
  TerminalSquare,
} from "lucide-react";
import Tooltip from "./Tooltip";
import { type BottomPanelTab } from "./BottomPanel";
import { type ResolvedThemeTokens } from "../lib/themeTokens";

interface Props {
  activeFile: string | null;
  hasWorkspace: boolean;
  language: string;
  cursor: { line: number; col: number };
  sidebarCollapsed: boolean;
  terminalOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  problemCount: number;
  gitBranch: string | null;
  gitChangeCount: number;
  themeTokens: ResolvedThemeTokens;
  onToggleSidebar: () => void;
  onOpenWorkspaceSearch: () => void;
  onToggleTerminal: () => void;
  onOpenBottomPanel: (tab: BottomPanelTab) => void;
  onOpenSourceControl: () => void;
}

export default function StatusBar({
  activeFile,
  hasWorkspace,
  language,
  cursor,
  sidebarCollapsed,
  terminalOpen,
  bottomPanelOpen,
  bottomPanelTab,
  problemCount,
  gitBranch,
  gitChangeCount,
  themeTokens,
  onToggleSidebar,
  onOpenWorkspaceSearch,
  onToggleTerminal,
  onOpenBottomPanel,
  onOpenSourceControl,
}: Props) {
  return (
    <div
      className="h-7 border-t flex items-center justify-between px-2 text-[11px] text-[#586478] shrink-0 gap-2"
      style={{
        background: themeTokens["status_bar.background"],
        borderColor: "var(--axon-panel-border)",
      }}
    >
      <div className="flex min-w-0 items-center gap-1 shrink-0">
        <Tooltip label="Toggle sidebar" side="top">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            className={`flex h-5 w-6 items-center justify-center rounded transition-colors cursor-pointer
            ${sidebarCollapsed ? "text-[#586478] hover:text-[#80c8e0]" : "text-[#80c8e0]"}`}
          >
            <PanelLeft size={13} />
          </button>
        </Tooltip>

        {hasWorkspace && (
          <Tooltip label="Search workspace" side="top">
            <button
              onClick={onOpenWorkspaceSearch}
              aria-label="Search workspace"
              className="flex h-5 w-6 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:text-[#80c8e0]"
            >
              <Search size={12} />
            </button>
          </Tooltip>
        )}

        {gitBranch ? (
          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
        ) : null}

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
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {activeFile && (
          <>
            <span className="flex items-center gap-1 px-2 text-[#9aa4b8]">
              <FileCode size={11} />
              {language}
            </span>
            <div className="h-4 w-px bg-[var(--axon-panel-border)]" />
            <span className="px-2 text-[#586478]">UTF-8</span>
            <div className="h-4 w-px bg-[var(--axon-panel-border)]" />
            <span className="px-2 text-[#586478]">
              Ln {cursor.line}, Col {cursor.col}
            </span>
            <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
          </>
        )}

        {hasWorkspace && (
          <>
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

            <div className="mx-0.5 h-4 w-px bg-[var(--axon-panel-border)]" />

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
          </>
        )}
      </div>
    </div>
  );
}
