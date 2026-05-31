// src/renderer/components/StatusBar.tsx
// Bottom status bar showing active file language, cursor position, encoding.
// Left side has sidebar toggle and folder name.
// Right side has terminal toggle, language, cursor position.
import { FileCode, PanelLeft, TerminalSquare } from "lucide-react";
import Tooltip from "./Tooltip";

interface Props {
  activeFile: string | null;
  language: string;
  cursor: { line: number; col: number };
  folderName: string | null;
  sidebarCollapsed: boolean;
  terminalOpen: boolean;
  onToggleSidebar: () => void;
  onToggleTerminal: () => void;
}

export default function StatusBar({
  activeFile,
  language,
  cursor,
  folderName,
  sidebarCollapsed,
  terminalOpen,
  onToggleSidebar,
  onToggleTerminal,
}: Props) {
  return (
    <div className="h-7 bg-[#0a0c12] border-t border-[#222838] flex items-center px-2 text-[11px] text-[#586478] shrink-0 gap-1">
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

      <div className="ml-auto flex items-center gap-1">
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
