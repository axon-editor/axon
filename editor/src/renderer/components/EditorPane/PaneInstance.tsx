// A single editor pane with its own tab bar and editor area.
// Registers the whole pane as a dnd-kit drop target so tabs can be moved by
// dropping on the tab strip, editor surface, or empty pane placeholder.
// Clicking anywhere in the pane marks it as the active pane.
import { useDroppable } from "@dnd-kit/core";
import { type EditorSettings } from "../../../shared/settings";
import { type Pane } from "../../lib/types";
import TabBar, { getPaneDropId, type PaneDropData } from "../TabBar";
import MediaPreview, { isMediaFile } from "./MediaPreview";
import SingleEditor from "./SingleEditor";

interface Props {
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onSelectFile: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
}

export default function PaneInstance({
  pane,
  isActive,
  onActivate,
  onSelectFile,
  onCloseTab,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  editorSettings,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: getPaneDropId(pane.id),
    data: {
      type: "pane",
      paneId: pane.id,
    } satisfies PaneDropData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 overflow-hidden min-w-0 min-h-0
        ${isActive ? "ring-1 ring-[#222838] ring-inset" : ""}
        ${isOver ? "outline outline-1 outline-[#80c8e0] outline-inset" : ""}`}
      onClick={onActivate}
    >
      <TabBar
        openTabs={pane.openTabs}
        activeFile={pane.activeFile}
        dirtyFiles={pane.dirtyFiles}
        onSelect={onSelectFile}
        onClose={onCloseTab}
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
                  editorSettings={editorSettings}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
