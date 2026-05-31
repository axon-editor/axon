// Manages the multi-pane editor layout.
// Renders panes side by side (horizontal) or stacked (vertical)
// separated by resizable PaneDivider components.
// Pane sizes tracked as flex-grow values and updated on divider drag.
import { useState } from "react";
import { type Layout } from "../../lib/types";
import PaneInstance from "./PaneInstance";
import PaneDivider from "../PaneDivider";

interface Props {
  layout: Layout;
  onActivatePane: (paneId: string) => void;
  onSelectFile: (paneId: string, filePath: string) => void;
  onCloseTab: (paneId: string, filePath: string) => void;
  onReorderTabs: (paneId: string, newTabs: string[]) => void;
  onDirtyChange: (paneId: string, filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  onMoveTabBetweenPanes: (
    filePath: string,
    sourcePaneId: string,
    targetPaneId: string,
  ) => void;
}

export default function EditorPane({
  layout,
  onActivatePane,
  onSelectFile,
  onCloseTab,
  onReorderTabs,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  onMoveTabBetweenPanes,
}: Props) {
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

  const isHorizontal = layout.splitDirection === "horizontal";

  return (
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
            isActive={pane.id === layout.activePaneId}
            onActivate={() => onActivatePane(pane.id)}
            onSelectFile={(f) => onSelectFile(pane.id, f)}
            onCloseTab={(f) => onCloseTab(pane.id, f)}
            onReorderTabs={(tabs) => onReorderTabs(pane.id, tabs)}
            onDirtyChange={(f, d) => onDirtyChange(pane.id, f, d)}
            onCursorChange={onCursorChange}
            onLanguageChange={onLanguageChange}
            onTabDropped={(filePath, sourcePaneId) =>
              onMoveTabBetweenPanes(filePath, sourcePaneId, pane.id)
            }
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
  );
}
