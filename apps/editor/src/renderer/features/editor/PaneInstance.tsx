// A single editor pane with its own tab bar and editor area.
// Registers the whole pane as a dnd-kit drop target so tabs can be moved by
// dropping on the tab strip, editor surface, or empty pane placeholder.
// Clicking anywhere in the pane marks it as the active pane.
import { useDroppable } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import {
  type EditorSettings,
  type ThemeId,
} from "../../../shared/settings";
import { type GitChange } from "../../../shared/git";
import { type EditorDiagnostic } from "../../../shared/diagnostics";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import {
  decodeFileTreeDragPayload,
  FILE_TREE_DRAG_TYPE,
} from "./lib/dragData";
import { type EditorNavigationTarget } from "./lib/navigation";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import { type Pane } from "./lib/types";
import TabBar, { getPaneDropId, type PaneDropData } from "./TabBar";
import {
  getHtmlPreviewFilePath,
  isHtmlPreviewTabPath,
} from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import {
  createMarkdownPreviewTabPath,
  getMarkdownPreviewFilePath,
  isMarkdownPreviewTabPath,
} from "@axon-builtin-markdown/lib/markdownPreviewTabs";
import { isWelcomeTabPath } from "../onboarding/lib/welcomeTab";
import { isProblemsTabPath } from "@axon-builtin-problems/lib/problemsTab";
import ProblemsPanel from "@axon-builtin-problems/ProblemsPanel";
import MediaPreview, { isMediaFile } from "@axon-builtin-media-preview/MediaPreview";
import HtmlPreview from "@axon-builtin-html-preview/HtmlPreview";
import MarkdownPreviewTab from "@axon-builtin-markdown/MarkdownPreviewTab";
import SingleEditor from "./SingleEditor";
import EmptyPane from "./EmptyPane";
import WorkspaceBlankPane from "./WorkspaceBlankPane";
import WelcomeTab, { type WelcomeThemeItem } from "../onboarding/WelcomeTab";

interface Props {
  pane: Pane;
  folderPath: string | null;
  isActive: boolean;
  onActivate: () => void;
  onSelectFile: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
  onPinTab: (filePath: string, pinned: boolean) => void;
  onCloseEmptyPane?: () => void;
  onOpenAgent: () => void;
  onOpenTabInTerminal?: (filePath: string) => void;
  onOpenFile?: (filePath: string) => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onSelectTheme: (themeId: ThemeId) => void;
  themeItems: WelcomeThemeItem[];
  onOpenNavigationTarget?: (
    target: Omit<EditorNavigationTarget, "id">,
  ) => void;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
  currentThemeId: ThemeId;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
  diagnostics: EditorDiagnostic[];
  deletedFiles?: Set<string>;
  onOpenFolder: () => void;
  onNewFile: () => void;
  onSelectRecentFolder: (path: string) => void;
  nativeControlInset?: {
    start: number;
    end: number;
  };
}

export default function PaneInstance({
  pane,
  folderPath,
  isActive,
  onActivate,
  onSelectFile,
  onCloseTab,
  onPinTab,
  onCloseEmptyPane,
  onOpenAgent,
  onOpenTabInTerminal,
  onOpenFile,
  onOpenSettings,
  onOpenTerminal,
  onSelectTheme,
  themeItems,
  onOpenNavigationTarget,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  editorSettings,
  currentThemeId,
  themeSyntax,
  themeTokens,
  navigationTarget,
  gitChanges,
  diagnostics,
  deletedFiles,
  onOpenFolder,
  onNewFile,
  onSelectRecentFolder,
  nativeControlInset,
}: Props) {
  const [fileDragOver, setFileDragOver] = useState(false);
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(
    () => new Set(pane.activeFile ? [pane.activeFile] : []),
  );
  const nativeDragDepth = useRef(0);

  useEffect(() => {
    setMountedTabs((current) => {
      const next = new Set(
        [...current].filter((tabPath) => pane.openTabs.includes(tabPath)),
      );
      if (pane.activeFile) next.add(pane.activeFile);
      if (
        next.size === current.size &&
        [...next].every((tabPath) => current.has(tabPath))
      ) {
        return current;
      }
      return next;
    });
  }, [pane.activeFile, pane.openTabs]);

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

  const hasExternalFilePayload = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const hasPaneDropPayload = (event: React.DragEvent) =>
    hasFileTreePayload(event) || hasExternalFilePayload(event);

  const handleNativeDragEnter = (event: React.DragEvent) => {
    if (!hasPaneDropPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    nativeDragDepth.current++;
    setFileDragOver(true);
  };

  const handleNativeDragOver = (event: React.DragEvent) => {
    if (!hasPaneDropPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setFileDragOver(true);
  };

  const handleNativeDragLeave = (event: React.DragEvent) => {
    if (!hasPaneDropPayload(event)) return;
    event.stopPropagation();
    nativeDragDepth.current = Math.max(0, nativeDragDepth.current - 1);
    if (nativeDragDepth.current === 0) setFileDragOver(false);
  };

  const handleNativeDrop = (event: React.DragEvent) => {
    if (!hasPaneDropPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    nativeDragDepth.current = 0;
    setFileDragOver(false);

    const externalPaths = window.axon.getDroppedFilePaths(
      Array.from(event.dataTransfer.files),
    );
    if (externalPaths.length > 0) {
      if (!folderPath) return;

      // External pane drops are imports into the current workspace, not direct
      // editor reads from an arbitrary filesystem location. The main-process
      // import endpoint validates the target directory, rejects overwrites, and
      // copies with exclusive creation before Axon opens the imported file.
      void window.axon
        .importExternalEntries(externalPaths, folderPath)
        .then((importedEntries) => {
          const firstImportedFile = importedEntries.find((entry) => !entry.isDir);
          if (!firstImportedFile) return;
          onSelectFile(firstImportedFile.targetPath);
          onActivate();
        })
        .catch((err) => {
          console.error("pane external drop import failed:", err);
        });
      return;
    }

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
        deletedFiles={deletedFiles}
        onSelect={onSelectFile}
        onClose={onCloseTab}
        onPinTab={onPinTab}
        onOpenInTerminal={onOpenTabInTerminal}
        paneId={pane.id}
        pinnedTabs={pane.pinnedTabs ?? []}
        nativeControlInset={nativeControlInset}
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
          pane.openTabs
            .filter((path) => mountedTabs.has(path) || path === pane.activeFile)
            .map((path) => (
            <div
              key={path}
              className="absolute inset-0"
              style={{
                display: path === pane.activeFile ? "flex" : "none",
                flexDirection: "column",
              }}
            >
              {isWelcomeTabPath(path) ? (
                <WelcomeTab
                  currentThemeId={currentThemeId}
                  onOpenAgent={onOpenAgent}
                  onOpenFolder={onOpenFolder}
                  onOpenSettings={onOpenSettings}
                  onOpenTerminal={onOpenTerminal}
                  onSelectTheme={onSelectTheme}
                  themes={themeItems}
                />
              ) : isProblemsTabPath(path) ? (
                <ProblemsPanel
                  activeFile={null}
                  diagnostics={diagnostics}
                  onOpenDiagnostic={(diagnostic) =>
                    onOpenNavigationTarget?.({
                      path: diagnostic.path,
                      line: diagnostic.line,
                      column: diagnostic.column,
                      length: Math.max(
                        1,
                        (diagnostic.endColumn ?? diagnostic.column + 1) -
                          diagnostic.column,
                      ),
                    })
                  }
                />
              ) : isHtmlPreviewTabPath(path) ? (
                <HtmlPreview
                  filePath={getHtmlPreviewFilePath(path)}
                  folderPath={folderPath}
                />
              ) : isMarkdownPreviewTabPath(path) ? (
                <MarkdownPreviewTab
                  filePath={getMarkdownPreviewFilePath(path)}
                  folderPath={folderPath}
                  onOpenFile={onOpenFile}
                />
              ) : isMediaFile(path) ? (
                <MediaPreview filePath={path} />
              ) : (
                <SingleEditor
                  filePath={path}
                  folderPath={folderPath}
                  visible={path === pane.activeFile && isActive}
                  onDirtyChange={onDirtyChange}
                  onOpenFile={onOpenFile}
                  onOpenMarkdownPreviewTab={(markdownPath) =>
                    onSelectFile(createMarkdownPreviewTabPath(markdownPath))
                  }
                  onOpenNavigationTarget={onOpenNavigationTarget}
                  onCursorChange={isActive ? onCursorChange : () => {}}
                  onLanguageChange={isActive ? onLanguageChange : () => {}}
                  editorSettings={editorSettings}
                  themeSyntax={themeSyntax}
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
