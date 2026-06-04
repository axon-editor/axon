// A single editor pane with its own tab bar and editor area.
// Registers the whole pane as a dnd-kit drop target so tabs can be moved by
// dropping on the tab strip, editor surface, or empty pane placeholder.
// Clicking anywhere in the pane marks it as the active pane.
import { useDroppable } from "@dnd-kit/core";
import { useRef, useState } from "react";
import { type EditorSettings } from "../../../shared/settings";
import { type GitChange } from "../../../shared/git";
import {
  decodeFileTreeDragPayload,
  FILE_TREE_DRAG_TYPE,
} from "../../lib/dragData";
import { type EditorNavigationTarget } from "../../lib/navigation";
import { type ResolvedThemeTokens } from "../../lib/themeTokens";
import { type Pane } from "../../lib/types";
import TabBar, { getPaneDropId, type PaneDropData } from "../TabBar";
import {
  getHtmlPreviewFilePath,
  isHtmlPreviewTabPath,
} from "../../lib/htmlPreviewTabs";
import MediaPreview, { isMediaFile } from "./MediaPreview";
import HtmlPreview from "./HtmlPreview";
import SingleEditor from "./SingleEditor";
import EmptyPane from "./EmptyPane";
import WorkspaceBlankPane from "./WorkspaceBlankPane";

interface Props {
  pane: Pane;
  folderPath: string | null;
  isActive: boolean;
  onActivate: () => void;
  onSelectFile: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
  onCloseEmptyPane?: () => void;
  onOpenTabInTerminal?: (filePath: string) => void;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
  onOpenFolder: () => void;
  onNewFile: () => void;
  onSelectRecentFolder: (path: string) => void;
}

export default function PaneInstance({
  pane,
  folderPath,
  isActive,
  onActivate,
  onSelectFile,
  onCloseTab,
  onCloseEmptyPane,
  onOpenTabInTerminal,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  editorSettings,
  themeTokens,
  navigationTarget,
  gitChanges,
  onOpenFolder,
  onNewFile,
  onSelectRecentFolder,
}: Props) {
  const [fileDragOver, setFileDragOver] = useState(false);
  const nativeDragDepth = useRef(0);

  const { isOver, setNodeRef } = useDroppable({
    id: getPaneDropId(pane.id),
    data: {
      type: "pane",
      paneId: pane.id,
    } satisfies PaneDropData,
  });

  const getFileTreePayload = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types);

    if (types.includes(FILE_TREE_DRAG_TYPE)) {
      const payload = decodeFileTreeDragPayload(
        event.dataTransfer.getData(FILE_TREE_DRAG_TYPE),
      );
      if (payload) return payload;
    }

    const plainPath = event.dataTransfer.getData("text/plain");
    if (!plainPath) return null;

    return {
      path: plainPath,
      isDir: false,
    };
  };

  const hasFileTreePayload = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types);
    return types.includes(FILE_TREE_DRAG_TYPE) || types.includes("text/plain");
  };

  const handleNativeDragEnter = (event: React.DragEvent) => {
    if (!hasFileTreePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    nativeDragDepth.current++;
    setFileDragOver(true);
  };

  const handleNativeDragOver = (event: React.DragEvent) => {
    if (!hasFileTreePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setFileDragOver(true);
  };

  const handleNativeDragLeave = (event: React.DragEvent) => {
    if (!hasFileTreePayload(event)) return;
    event.stopPropagation();
    nativeDragDepth.current = Math.max(0, nativeDragDepth.current - 1);
    if (nativeDragDepth.current === 0) setFileDragOver(false);
  };

  const handleNativeDrop = (event: React.DragEvent) => {
    if (!hasFileTreePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    nativeDragDepth.current = 0;
    setFileDragOver(false);

    const payload = getFileTreePayload(event);

    if (!payload || payload.isDir) return;

    // Dropping from the file tree into an editor pane should open the file in
    // that pane, not move it on disk. The tree still uses the same drag gesture
    // for file moves, so the pane consumes only the structured Axon payload and
    // leaves folder/file tree drops to the sidebar.
    onSelectFile(payload.path);
    onActivate();
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 overflow-hidden min-w-0 min-h-0
        ${isActive ? "ring-1 ring-[#222838] ring-inset" : ""}
        ${isOver || fileDragOver ? "outline outline-1 outline-[#80c8e0] outline-inset" : ""}`}
      onClick={onActivate}
      onDragEnterCapture={handleNativeDragEnter}
      onDragOverCapture={handleNativeDragOver}
      onDragLeaveCapture={handleNativeDragLeave}
      onDropCapture={handleNativeDrop}
    >
      <TabBar
        openTabs={pane.openTabs}
        activeFile={pane.activeFile}
        dirtyFiles={pane.dirtyFiles}
        onSelect={onSelectFile}
        onClose={onCloseTab}
        onOpenInTerminal={onOpenTabInTerminal}
        paneId={pane.id}
      />

      <div className="flex-1 overflow-hidden relative">
        {pane.openTabs.length === 0 && !folderPath ? (
          <EmptyPane
            onOpenFolder={onOpenFolder}
            onNewFile={onNewFile}
            onSelectRecentFolder={onSelectRecentFolder}
            onClosePane={onCloseEmptyPane}
          />
        ) : pane.openTabs.length === 0 ? (
          <WorkspaceBlankPane />
        ) : (
          pane.openTabs.map((path) => (
            <div
              key={path}
              className="absolute inset-0"
              style={{
                display: path === pane.activeFile ? "flex" : "none",
                flexDirection: "column",
              }}
            >
              {isHtmlPreviewTabPath(path) ? (
                <HtmlPreview
                  filePath={getHtmlPreviewFilePath(path)}
                  folderPath={folderPath}
                />
              ) : isMediaFile(path) ? (
                <MediaPreview filePath={path} />
              ) : (
                <SingleEditor
                  filePath={path}
                  folderPath={folderPath}
                  visible={path === pane.activeFile && isActive}
                  onDirtyChange={onDirtyChange}
                  onCursorChange={isActive ? onCursorChange : () => {}}
                  onLanguageChange={isActive ? onLanguageChange : () => {}}
                  editorSettings={editorSettings}
                  themeTokens={themeTokens}
                  navigationTarget={navigationTarget}
                  gitChanges={gitChanges}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
