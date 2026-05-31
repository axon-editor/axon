// A single editor pane with its own tab bar and editor area.
// Handles tab drag and drop between panes via HTML5 drag events.
// Clicking anywhere in the pane marks it as the active pane.
import { type Pane } from "../../lib/types";
import TabBar from "../TabBar";
import MediaPreview, { isMediaFile } from "./MediaPreview";
import SingleEditor from "./SingleEditor";

interface Props {
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onSelectFile: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
  onReorderTabs: (newTabs: string[]) => void;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  onTabDropped: (filePath: string, sourcePaneId: string) => void;
}

export default function PaneInstance({
  pane,
  isActive,
  onActivate,
  onSelectFile,
  onCloseTab,
  onReorderTabs,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  onTabDropped,
}: Props) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("axon/tab");
    if (!data) return;
    const { filePath, sourcePaneId } = JSON.parse(data);
    if (sourcePaneId !== pane.id) {
      onTabDropped(filePath, sourcePaneId);
    }
  };

  return (
    <div
      className={`flex flex-col flex-1 overflow-hidden min-w-0 min-h-0
        ${isActive ? "ring-1 ring-[#222838] ring-inset" : ""}`}
      onClick={onActivate}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TabBar
        openTabs={pane.openTabs}
        activeFile={pane.activeFile}
        dirtyFiles={pane.dirtyFiles}
        onSelect={onSelectFile}
        onClose={onCloseTab}
        onReorder={onReorderTabs}
        paneId={pane.id}
      />

      <div className="flex-1 overflow-hidden relative">
        {pane.openTabs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 select-none">
            <img
              src="/axon.png"
              alt="Axon"
              className="w-24 h-24"
              draggable={false}
            />
            <span className="text-[12px] text-[#364050]">
              open a file to start editing
            </span>
          </div>
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
              {isMediaFile(path) ? (
                <MediaPreview filePath={path} />
              ) : (
                <SingleEditor
                  filePath={path}
                  visible={path === pane.activeFile && isActive}
                  onDirtyChange={onDirtyChange}
                  onCursorChange={isActive ? onCursorChange : () => {}}
                  onLanguageChange={isActive ? onLanguageChange : () => {}}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
