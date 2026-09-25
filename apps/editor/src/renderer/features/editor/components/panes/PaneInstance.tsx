/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A single editor pane with its own tab bar and editor area.
// Registers the whole pane as a dnd-kit drop target so tabs can be moved by
// dropping on the tab strip, editor surface, or empty pane placeholder.
// Clicking anywhere in the pane marks it as the active pane.
import { useDroppable } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import {
  type AxonSettings,
  type EditorSettings,
  type ThemeId,
} from "@axon-editor/shared/settings";
import { type GitChange } from "@axon-editor/shared/git";
import { type EditorDiagnostic } from "@axon-editor/shared/diagnostics";
import {
  type ExtensionState,
  type ExtensionThemeSyntaxStyle,
} from "@axon-editor/shared/extensions";
import {
  decodeFileTreeDragPayload,
  FILE_TREE_DRAG_TYPE,
} from "../../lib/layout/dragData";
import { type EditorNavigationTarget } from "../../lib/layout/navigation";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import { editorFontStack } from "@axon-editor/renderer/shared/lib/fonts";
import { type Pane } from "../../lib/layout/types";
import TabBar, { getPaneDropId, type PaneDropData } from "../tabs/TabBar";
import {
  getHtmlPreviewFilePath,
  isHtmlPreviewTabPath,
} from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import {
  getExtensionWebviewExtensionId,
  isExtensionWebviewTabPath,
} from "@axon-editor/workbench/contrib/extensions/webview/lib/extensionWebviewTabs";
import {
  createMarkdownPreviewTabPath,
  getMarkdownPreviewFilePath,
  isMarkdownPreviewTabPath,
} from "@axon-builtin-markdown/lib/markdownPreviewTabs";
import { isWelcomeTabPath } from "@axon-editor/renderer/features/onboarding/lib/welcomeTab";
import { isProblemsTabPath } from "@axon-builtin-problems/lib/problemsTab";
import ProblemsPanel from "@axon-builtin-problems/ProblemsPanel";
import MediaPreview, {
  isMediaFile,
} from "@axon-builtin-media-preview/MediaPreview";
import BinaryFilePreview from "@axon-builtin-media-preview/BinaryFilePreview";
import { isKnownBinaryFile } from "@axon-editor/shared/binaryFiles";
import HtmlPreview from "@axon-builtin-html-preview/HtmlPreview";
import ExtensionWebview from "@axon-editor/workbench/contrib/extensions/webview/ExtensionWebview";
import MarkdownPreviewTab from "@axon-builtin-markdown/MarkdownPreviewTab";
import SingleEditor from "../surface/SingleEditor";
import EmptyPane from "./EmptyPane";
import WorkspaceBlankPane from "./WorkspaceBlankPane";
import WelcomeTab, {
  type WelcomeThemeItem,
} from "@axon-editor/renderer/features/onboarding/WelcomeTab";
import GitGraphPanel from "@axon-builtin-git/git/advanced/GitGraphPanel";
import GitCommitDiffTab from "@axon-builtin-git/git/GitCommitDiffTab";
import {
  isGitCommitDiffTabPath,
  isGitGraphTabPath,
} from "@axon-builtin-git/git/lib/gitGraphTab";
import CodeSnapshot from "@axon-builtin-code-snapshot/CodeSnapshot";
import { isCodeSnapshotTabPath } from "@axon-builtin-code-snapshot/lib/codeSnapshotTabs";
import SettingsTab from "@axon-builtin-settings/settings/SettingsTab";
import { isSettingsTabPath } from "@axon-builtin-settings/settings/lib/settingsTab";

interface Props {
  pane: Pane;
  language: string;
  availableFonts: AxonSettings["customFonts"];
  extensionState: ExtensionState | null;
  settings: AxonSettings;
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
  onPreviewSettings: (settings: AxonSettings) => void;
  onSaveSettings: (
    settings: AxonSettings,
  ) => boolean | void | Promise<boolean | void>;
  onOpenLanguageTools: () => void;
  onViewLogs: () => void;
  themeItems: WelcomeThemeItem[];
  onOpenNavigationTarget?: (target: Omit<EditorNavigationTarget, "id">) => void;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
  languageServicesEnabled: boolean;
  currentThemeId: ThemeId;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
  isGitRepository?: boolean;
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
  language,
  availableFonts,
  extensionState,
  settings,
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
  onPreviewSettings,
  onSaveSettings,
  onOpenLanguageTools,
  onViewLogs,
  themeItems,
  onOpenNavigationTarget,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  editorSettings,
  languageServicesEnabled,
  currentThemeId,
  themeSyntax,
  themeTokens,
  navigationTarget,
  gitChanges,
  isGitRepository,
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

    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length > 0) {
      // The editor surface treats a native drop as "open", matching normal
      // editor behavior. Importing is intentionally owned by the Files sidebar
      // because only that target communicates that the user wants a copy added
      // to the workspace rather than a temporary read-only tab.
      void window.axon
        .authorizeDroppedFiles(droppedFiles, folderPath)
        .then((authorizedPaths) => {
          const firstFile = authorizedPaths[0];
          if (!firstFile) return;
          onSelectFile(firstFile);
          onActivate();
        })
        .catch((err) => {
          console.error("pane external file open failed:", err);
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
            onSelectRecentFolder={onSelectRecentFolder}
            onClosePane={onCloseEmptyPane}
          />
        ) : pane.openTabs.length === 0 ? (
          <WorkspaceBlankPane onNewFile={onNewFile} />
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
                ) : isGitGraphTabPath(path) ? (
                  <GitGraphPanel folderPath={folderPath} variant="full" />
                ) : isGitCommitDiffTabPath(path) ? (
                  <GitCommitDiffTab
                    editorSettings={editorSettings}
                    tabPath={path}
                    themeSyntax={themeSyntax}
                    themeTokens={themeTokens}
                    onClose={() => onCloseTab(path)}
                  />
                ) : isCodeSnapshotTabPath(path) ? (
                  <CodeSnapshot
                    editorSettings={editorSettings}
                    tabPath={path}
                    themeSyntax={themeSyntax}
                    themeTokens={themeTokens}
                  />
                ) : isSettingsTabPath(path) ? (
                  <SettingsTab
                    folderPath={folderPath}
                    language={language}
                    availableFonts={availableFonts}
                    extensionState={extensionState}
                    settings={settings}
                    onCloseTab={() => onCloseTab(path)}
                    onPreview={onPreviewSettings}
                    onSave={onSaveSettings}
                    onOpenLanguageTools={onOpenLanguageTools}
                    onViewLogs={onViewLogs}
                  />
                ) : isHtmlPreviewTabPath(path) ? (
                  <HtmlPreview
                    filePath={getHtmlPreviewFilePath(path)}
                    folderPath={folderPath}
                  />
                ) : isExtensionWebviewTabPath(path) ? (
                  <ExtensionWebview
                    extensionId={getExtensionWebviewExtensionId(path) ?? path}
                  />
                ) : isMarkdownPreviewTabPath(path) ? (
                  <MarkdownPreviewTab
                    filePath={getMarkdownPreviewFilePath(path)}
                    folderPath={folderPath}
                    fontFamily={editorFontStack(editorSettings.fontFamily)}
                    onOpenFile={onOpenFile}
                  />
                ) : isMediaFile(path) ? (
                  <MediaPreview filePath={path} />
                ) : isKnownBinaryFile(path) ? (
                  <BinaryFilePreview filePath={path} />
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
                    languageServicesEnabled={languageServicesEnabled}
                    themeSyntax={themeSyntax}
                    themeTokens={themeTokens}
                    navigationTarget={navigationTarget}
                    gitChanges={gitChanges}
                    isGitRepository={isGitRepository}
                  />
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
