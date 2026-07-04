// Bottom status bar showing active file language, cursor position, encoding.
// Left side has sidebar toggle and the workspace switcher.
// Right side has terminal toggle, language, cursor position.
import {
  AlertCircle,
  FileCode,
  Files,
  FlaskConical,
  GitBranch,
  ListChecks,
  Music4,
  PanelLeft,
  Search,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import Tooltip from "./Tooltip";
import { type BottomPanelTab } from "../../../platform/panel/bottomPanel";
import { type ResolvedThemeTokens } from "../lib/themeTokens";

type view = "files" | "history" | "spotify";
interface Props {
  activeFile: string | null;
  hasWorkspace: boolean;
  language: string;
  cursor: { line: number; col: number };
  sidebarCollapsed: boolean;
  terminalOpen: boolean;
  aiEnabled: boolean;
  agentSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  problemCount: number;
  errorCount: number;
  warningCount: number;
  gitBranch: string | null;
  gitChangeCount: number;
  themeTokens: ResolvedThemeTokens;
  onToggleSidebar: () => void;
  onOpenWorkspaceSearch: () => void;
  onToggleTerminal: () => void;
  onToggleAgentSidebar: () => void;
  onOpenProblems: () => void;
  onOpenBottomPanel: (tab: BottomPanelTab) => void;
  onOpenSourceControl: () => void;
  onOpenTests: () => void;
  onViewChange: (view: view) => void;
  view: view;
}

export default function StatusBar({
  activeFile,
  hasWorkspace,
  language,
  cursor,
  sidebarCollapsed,
  terminalOpen,
  aiEnabled,
  agentSidebarOpen,
  bottomPanelOpen,
  bottomPanelTab,
  problemCount,
  errorCount,
  warningCount,
  gitBranch,
  gitChangeCount,
  themeTokens,
  onToggleSidebar,
  onOpenWorkspaceSearch,
  onToggleTerminal,
  onToggleAgentSidebar,
  onOpenProblems,
  onOpenBottomPanel,
  onOpenSourceControl,
  onOpenTests,
  onViewChange,
  view,
}: Props) {
  const axonAccent =
    "linear-gradient(90deg, #ff6b5f 0%, #f2c94c 36%, #54d6b5 72%, #80c8e0 100%)";
  const activeControlClass =
    "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]";
  const idleControlClass =
    "text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100";

  return (
    <div
      className="relative flex h-8 shrink-0 items-center justify-between gap-2 border-t px-2 text-[11px] text-[var(--axon-editor-foreground)]"
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0.08)), ${themeTokens["status_bar.background"]}`,
        borderColor: "var(--axon-panel-border)",
      }}
    >
      <div
        aria-hidden="true"
        className="axon-status-flow-strip absolute left-0 top-0 h-px w-full"
        style={{ background: axonAccent }}
      />
      <div className="flex min-w-0 items-center gap-1 shrink-0">
        <Tooltip label="Toggle sidebar (Cmd+B)" side="top">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            className={`flex h-5 w-6 items-center justify-center rounded transition-colors cursor-pointer
            ${sidebarCollapsed ? "text-[var(--axon-editor-foreground)] opacity-55 hover:text-[#54d6b5] hover:opacity-100" : "text-[#54d6b5]"}`}
          >
            <PanelLeft size={13} />
          </button>
        </Tooltip>

        {hasWorkspace && (
          <Tooltip label="Search workspace (Cmd+Shift+F)" side="top">
            <button
              onClick={onOpenWorkspaceSearch}
              aria-label="Search workspace"
              className="flex h-5 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:text-[#54d6b5] hover:opacity-100"
            >
              <Search size={12} />
            </button>
          </Tooltip>
        )}

        <div className="mx-0.5 h-4 w-px bg-[var(--axon-panel-border)]" />

        <Tooltip label="Files (Status bar)" side="top">
          <button
            type="button"
            onClick={() => onViewChange("files")}
            aria-label="Show files"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              view === "files" ? activeControlClass : idleControlClass
            }`}
          >
            <Files size={13} />
          </button>
        </Tooltip>

        <Tooltip label="Git History (Status bar)" side="top">
          <button
            type="button"
            onClick={() => onViewChange("history")}
            aria-label="Show Git history"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              view === "history" ? activeControlClass : idleControlClass
            }`}
          >
            <GitBranch size={13} />
          </button>
        </Tooltip>

        <div className="mx-0.5 h-4 w-px bg-[var(--axon-panel-border)]" />

        <Tooltip label="Spotify" side="top">
          <button
            type="button"
            onClick={() => onViewChange("spotify")}
            aria-label="Show Spotify"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              view === "spotify"
                ? "bg-[var(--axon-panel-overlay-hover)] text-[#1db954]"
                : "text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#1db954] hover:opacity-100"
            }`}
          >
            <Music4 size={13} />
          </button>
        </Tooltip>

        {gitBranch ? (
          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
        ) : null}

        {gitBranch && (
          <Tooltip label="Source control (Cmd+Shift+G)" side="top">
            <button
              onClick={onOpenSourceControl}
              aria-label="Source control"
              className="flex h-5 cursor-pointer items-center gap-1 rounded px-2 text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:text-[#54d6b5] hover:opacity-100"
            >
              <GitBranch size={12} />
              <span className="max-w-32 truncate">{gitBranch}</span>
              {gitChangeCount > 0 && (
                <span className="text-[#54d6b5]">{gitChangeCount}</span>
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
            <Tooltip
              label={`Problems (Cmd+Shift+M) - ${errorCount} errors, ${warningCount} warnings`}
              side="top"
            >
              <button
                onClick={onOpenProblems}
                aria-label="Problems"
                className={`flex items-center gap-1 rounded px-2 h-5 transition-colors cursor-pointer
                ${activeFile?.startsWith("axon://workbench/problems") ? "text-[#54d6b5]" : "text-[#586478] hover:text-[#54d6b5]"}`}
              >
                <AlertCircle size={12} />
                <span className={errorCount > 0 ? "text-[#ea6c73]" : ""}>
                  {errorCount}
                </span>
                <span className="text-[#3f485a]">/</span>
                <span className={warningCount > 0 ? "text-[#ffcc66]" : ""}>
                  {warningCount}
                </span>
                {problemCount > errorCount + warningCount && (
                  <span className="text-[#647086]">
                    +{problemCount - errorCount - warningCount}
                  </span>
                )}
              </button>
            </Tooltip>

            <Tooltip label="Output (Status bar)" side="top">
              <button
                onClick={() => onOpenBottomPanel("output")}
                aria-label="Output"
                className={`flex items-center justify-center w-6 h-5 rounded transition-colors cursor-pointer
                ${bottomPanelOpen && bottomPanelTab === "output" ? "text-[#54d6b5]" : "text-[#586478] hover:text-[#54d6b5]"}`}
              >
                <ListChecks size={13} />
              </button>
            </Tooltip>

            <Tooltip label="Test Explorer" side="top">
              <button
                onClick={onOpenTests}
                aria-label="Test Explorer"
                className="flex h-5 w-6 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:text-[#54d6b5]"
              >
                <FlaskConical size={13} />
              </button>
            </Tooltip>

            <div className="mx-0.5 h-4 w-px bg-[var(--axon-panel-border)]" />

            <Tooltip label="Toggle terminal (Cmd+J)" side="top">
              <button
                onClick={onToggleTerminal}
                aria-label="Toggle terminal"
                className={`flex items-center justify-center w-6 h-5 rounded transition-colors cursor-pointer ml-1
                ${terminalOpen ? "text-[#54d6b5]" : "text-[#586478] hover:text-[#54d6b5]"}`}
              >
                <TerminalSquare size={13} />
              </button>
            </Tooltip>

            {aiEnabled && (
              <>
                <div className="mx-0.5 h-4 w-px bg-[var(--axon-panel-border)]" />
                <Tooltip label="Toggle Axon Agent (Status bar)" side="top">
                  <button
                    onClick={onToggleAgentSidebar}
                    aria-label="Toggle Axon Agent"
                    className={`flex h-5 w-6 cursor-pointer items-center justify-center rounded transition-colors
                    ${agentSidebarOpen ? "text-[#54d6b5]" : "text-[#586478] hover:text-[#54d6b5]"}`}
                  >
                    <Sparkles size={13} />
                  </button>
                </Tooltip>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
