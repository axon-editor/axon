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
import { type EditorSettings } from "../../../shared/settings";
import { type Layout } from "../../lib/types";
import PaneInstance from "./PaneInstance";
import PaneDivider from "../PaneDivider";
import { type DragTabData, type PaneDropData } from "../TabBar";
import { getTree, type FileNode } from "../../lib/api";

interface Props {
  layout: Layout;
  folderPath: string | null;
  onActivatePane: (paneId: string) => void;
  onSelectFile: (paneId: string, filePath: string) => void;
  onCloseTab: (paneId: string, filePath: string) => void;
  onOpenTabInTerminal?: (filePath: string) => void;
  onReorderTabs: (paneId: string, newTabs: string[]) => void;
  onDirtyChange: (paneId: string, filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  onMoveTabBetweenPanes: (
    filePath: string,
    sourcePaneId: string,
    targetPaneId: string,
  ) => void;
  editorSettings: EditorSettings;
  handleOpenFolder: () => void;
  handleNewFile: () => void;
  handleFolderChange: (path: string, fileTree: FileNode) => void;
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
  const name = path.split("/").pop() ?? path;
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-t
      border border-b-0 bg-[#0e1018] border-[#80c8e0] text-[#c8d0e0] shrink-0 select-none shadow-lg opacity-90"
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
  onOpenTabInTerminal,
  onReorderTabs,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  onMoveTabBetweenPanes,
  editorSettings,
  handleOpenFolder,
  handleNewFile,
  handleFolderChange,
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
              onOpenTabInTerminal={onOpenTabInTerminal}
              onDirtyChange={(f, d) => onDirtyChange(pane.id, f, d)}
              onCursorChange={onCursorChange}
              onLanguageChange={onLanguageChange}
              editorSettings={editorSettings}
              onOpenFolder={handleOpenFolder}
              onNewFile={handleNewFile}
              onSelectRecentFolder={async (path) => {
                const fileTree = await getTree(path);
                handleFolderChange(path, fileTree);
              }}
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
