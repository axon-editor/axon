// Renders all open file tabs with drag to reorder and inter-pane drag support.
// Uses dnd-kit metadata instead of raw file-path IDs so the same file can be
// open in multiple panes without confusing the drag target.
// Active tab highlighted, dirty tabs show cyan dot that reveals close on hover.
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import Tooltip from "./Tooltip";

export interface DragTabData {
  type: "tab";
  paneId: string;
  filePath: string;
}

export interface PaneDropData {
  type: "pane";
  paneId: string;
}

export function getTabDragId(paneId: string, filePath: string): string {
  return `tab:${paneId}:${filePath}`;
}

export function getPaneDropId(paneId: string): string {
  return `pane:${paneId}`;
}

interface Props {
  openTabs: string[];
  activeFile: string | null;
  dirtyFiles: Record<string, boolean>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  paneId: string;
}

function SortableTab({
  path,
  paneId,
  isActive,
  isDirty,
  onSelect,
  onClose,
}: {
  path: string;
  paneId: string;
  isActive: boolean;
  isDirty: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getTabDragId(paneId, path),
    data: {
      type: "tab",
      paneId,
      filePath: path,
    } satisfies DragTabData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0 : 1,
  };

  const name = path.split("/").pop() ?? path;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(path)}
      onAuxClick={(e) => {
        if (e.button === 1) onClose(path);
      }}
      className={`group flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-t
        border border-b-0 cursor-pointer transition-colors shrink-0 select-none
        ${
          isActive
            ? "bg-[#0e1018] border-[#222838] text-[#c8d0e0]"
            : "bg-transparent border-transparent text-[#586478] hover:text-[#9aa4b8] hover:bg-[#14161e]"
        }`}
    >
      {isDirty ? (
        <Tooltip label="Close tab" side="bottom">
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClose(path);
            }}
            role="button"
            aria-label="Close tab"
            className="w-3 h-3 flex items-center justify-center"
          >
            <span className="w-2 h-2 rounded-full bg-[#80c8e0] group-hover:hidden" />
            <X
              size={11}
              className="hidden group-hover:block text-[#586478] hover:text-white"
            />
          </span>
        </Tooltip>
      ) : (
        <Tooltip label="Close tab" side="bottom">
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClose(path);
            }}
            role="button"
            aria-label="Close tab"
            className="w-3 h-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={11} className="text-[#586478] hover:text-white" />
          </span>
        </Tooltip>
      )}
      <span>{name}</span>
    </div>
  );
}

export default function TabBar({
  openTabs,
  activeFile,
  dirtyFiles,
  onSelect,
  onClose,
  paneId,
}: Props) {
  if (openTabs.length === 0) {
    return (
      <div className="h-9 bg-[#0a0c12] border-b border-[#222838] flex items-center px-3">
        <span className="text-[11px] text-[#364050]">no file open</span>
      </div>
    );
  }

  return (
    <SortableContext
      items={openTabs.map((path) => getTabDragId(paneId, path))}
      strategy={horizontalListSortingStrategy}
    >
      <div className="h-9 bg-[#0a0c12] border-b border-[#222838] flex items-end overflow-x-auto px-1 gap-0.5 scrollbar-none">
        {openTabs.map((path) => (
          <SortableTab
            key={path}
            path={path}
            paneId={paneId}
            isActive={path === activeFile}
            isDirty={!!dirtyFiles[path]}
            onSelect={onSelect}
            onClose={onClose}
          />
        ))}
      </div>
    </SortableContext>
  );
}
