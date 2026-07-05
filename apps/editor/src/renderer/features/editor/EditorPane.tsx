// Manages the multi-pane editor layout.
// Renders panes side by side (horizontal) or stacked (vertical)
// separated by resizable PaneDivider components.
// Pane sizes tracked as flex-grow values and updated on divider drag.
import { useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  type EditorSettings,
  type ThemeId,
} from "../../../shared/settings";
import { type GitChange } from "../../../shared/git";
import { type EditorDiagnostic } from "../../../shared/diagnostics";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import { type Layout } from "./lib/types";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import { type EditorNavigationTarget } from "./lib/navigation";
import PaneInstance from "./PaneInstance";
import { type WelcomeThemeItem } from "../onboarding/WelcomeTab";
import PaneDivider from "./PaneDivider";
import { type DragTabData, type PaneDropData } from "./TabBar";
import { getTree, type FileNode } from "../../shared/lib/api";
import { addRecentFolder } from "../sidebar";
import { getTabDisplayName } from "./lib/tabIdentity";

interface Props {
  layout: Layout;
  folderPath: string | null;
  onActivatePane: (paneId: string) => void;
  onSelectFile: (paneId: string, filePath: string) => void;
  onCloseTab: (paneId: string, filePath: string) => void;
  onPinTab: (paneId: string, filePath: string, pinned: boolean) => void;
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
  onReorderTabs: (paneId: string, newTabs: string[]) => void;
  onDirtyChange: (paneId: string, filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  onMoveTabBetweenPanes: (
    filePath: string,
    sourcePaneId: string,
    targetPaneId: string,
  ) => void;
  onClosePane: (paneId: string) => void;
  editorSettings: EditorSettings;
  currentThemeId: ThemeId;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
  diagnostics: EditorDiagnostic[];
  deletedFiles?: Set<string>;
  handleOpenFolder: () => void;
  handleNewFile: () => void;
  handleFolderChange: (path: string, fileTree: FileNode) => void;
  nativeControlInset?: {
    start: number;
    end: number;
  };
}

function isDragTabData(data: unknown): data is DragTabData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as DragTabData).type === "tab" &&
    typeof (data as DragTabData).paneId === "string" &&
    typeof (data as DragTabData).filePath === "string"
  );
}

function isPaneDropData(data: unknown): data is PaneDropData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as PaneDropData).type === "pane" &&
    typeof (data as PaneDropData).paneId === "string"
  );
}

function GhostTab({ path }: { path: string }) {
  const name = getTabDisplayName(path);
  return (
    <div
      className="flex h-9 shrink-0 select-none items-center gap-1.5 border border-[#263047] bg-[#111720] px-3 text-[12px] text-[#e4ebf6] opacity-95 shadow-lg"
    >
      <span>{name}</span>
    </div>
  );
}

export default function EditorPane({
  layout,
  folderPath,
  onActivatePane,
  onSelectFile,
  onCloseTab,
  onPinTab,
  onOpenAgent,
  onOpenTabInTerminal,
  onOpenFile,
  onOpenSettings,
  onOpenTerminal,
  onSelectTheme,
  themeItems,
  onOpenNavigationTarget,
  onReorderTabs,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  onMoveTabBetweenPanes,
  onClosePane,
  editorSettings,
  currentThemeId,
  themeSyntax,
  themeTokens,
  navigationTarget,
  gitChanges,
  diagnostics,
  deletedFiles,
  handleOpenFolder,
  handleNewFile,
  handleFolderChange,
  nativeControlInset,
}: Props) {
  const [draggingTab, setDraggingTab] = useState<DragTabData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  // pane sizes as flex-grow values, default equal sizing
  const [paneSizes, setPaneSizes] = useState<Record<string, number>>(() => {
    const sizes: Record<string, number> = {};
    layout.panes.forEach((p) => (sizes[p.id] = 1));
    return sizes;
  });

  // when panes change (split/close) reset sizes to equal
  const paneCount = layout.panes.length;
  const currentSizeCount = Object.keys(paneSizes).length;
  if (currentSizeCount !== paneCount) {
    const sizes: Record<string, number> = {};
    layout.panes.forEach((p) => (sizes[p.id] = paneSizes[p.id] ?? 1));
    setTimeout(() => setPaneSizes(sizes), 0);
  }

  const handleResize = (
    leftPaneId: string,
    rightPaneId: string,
    delta: number,
  ) => {
    setPaneSizes((prev) => {
      const leftSize = (prev[leftPaneId] ?? 1) + delta * 0.005;
      const rightSize = (prev[rightPaneId] ?? 1) - delta * 0.005;
      if (leftSize < 0.1 || rightSize < 0.1) return prev;
      return { ...prev, [leftPaneId]: leftSize, [rightPaneId]: rightSize };
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (isDragTabData(data)) setDraggingTab(data);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setDraggingTab(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    setDraggingTab(null);

    if (!isDragTabData(activeData) || !overData) return;

    const targetPaneId = isDragTabData(overData)
      ? overData.paneId
      : isPaneDropData(overData)
        ? overData.paneId
        : null;

    if (!targetPaneId) return;

    if (targetPaneId !== activeData.paneId) {
              onMoveTabBetweenPanes(
                activeData.filePath,
        activeData.paneId,
        targetPaneId,
      );
      return;
    }

    if (!isDragTabData(overData)) return;

    const pane = layout.panes.find((p) => p.id === activeData.paneId);
    if (!pane || activeData.filePath === overData.filePath) return;

    const oldIndex = pane.openTabs.indexOf(activeData.filePath);
    const newIndex = pane.openTabs.indexOf(overData.filePath);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorderTabs(
      activeData.paneId,
      arrayMove(pane.openTabs, oldIndex, newIndex),
    );
  };

  const isHorizontal = layout.splitDirection === "horizontal";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={`flex flex-1 overflow-hidden ${isHorizontal ? "flex-row" : "flex-col"}`}
      >
        {layout.panes.map((pane, index) => (
          <div
            key={pane.id}
            className="flex flex-1 overflow-hidden min-w-0 min-h-0"
            style={{ flexGrow: paneSizes[pane.id] ?? 1 }}
          >
            <PaneInstance
              pane={pane}
              folderPath={folderPath}
              isActive={pane.id === layout.activePaneId}
              onActivate={() => onActivatePane(pane.id)}
              onSelectFile={(f) => onSelectFile(pane.id, f)}
              onCloseTab={(f) => onCloseTab(pane.id, f)}
              onPinTab={(f, pinned) => onPinTab(pane.id, f, pinned)}
              onCloseEmptyPane={
                layout.panes.length > 1 ? () => onClosePane(pane.id) : undefined
              }
              onOpenTabInTerminal={onOpenTabInTerminal}
              onOpenFile={onOpenFile}
              onOpenAgent={onOpenAgent}
              onOpenSettings={onOpenSettings}
              onOpenTerminal={onOpenTerminal}
              onSelectTheme={onSelectTheme}
              themeItems={themeItems}
              onOpenNavigationTarget={onOpenNavigationTarget}
              onDirtyChange={(f, d) => onDirtyChange(pane.id, f, d)}
              onCursorChange={onCursorChange}
              onLanguageChange={onLanguageChange}
              editorSettings={editorSettings}
              currentThemeId={currentThemeId}
              themeSyntax={themeSyntax}
              themeTokens={themeTokens}
              navigationTarget={navigationTarget}
              gitChanges={gitChanges}
              diagnostics={diagnostics}
              deletedFiles={deletedFiles}
              onOpenFolder={handleOpenFolder}
              onNewFile={handleNewFile}
              onSelectRecentFolder={async (path) => {
                const fileTree = await getTree(path);
                addRecentFolder(path);
                handleFolderChange(path, fileTree);
              }}
              nativeControlInset={index === 0 ? nativeControlInset : undefined}
            />
            {index < layout.panes.length - 1 && (
              <PaneDivider
                direction={isHorizontal ? "horizontal" : "vertical"}
                onResize={(delta) =>
                  handleResize(pane.id, layout.panes[index + 1].id, delta)
                }
              />
            )}
          </div>
        ))}
      </div>
      <DragOverlay>
        {draggingTab ? <GhostTab path={draggingTab.filePath} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
