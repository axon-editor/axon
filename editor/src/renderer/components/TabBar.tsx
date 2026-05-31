// Renders all open file tabs with drag to reorder support via dnd-kit.
// Each tab is a sortable item. Active tab is highlighted.
// Dirty tabs show a purple dot that reveals a close button on hover.
// Middle click closes a tab without needing to hover.
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";

interface Props {
  openTabs: string[];
  activeFile: string | null;
  dirtyFiles: Record<string, boolean>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (newTabs: string[]) => void;
  paneId: string;
}

function SortableTab({
  path,
  isActive,
  isDirty,
  paneId,
  onSelect,
  onClose,
}: {
  path: string;
  isActive: boolean;
  isDirty: boolean;
  paneId: string;
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
  } = useSortable({ id: path });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
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
      // inter-pane drag uses HTML5 drag API separately from dnd-kit
      draggable
      onDragStart={(e) => {
        // don't interfere with dnd-kit pointer events
        e.stopPropagation();
        e.dataTransfer.setData(
          "axon/tab",
          JSON.stringify({ filePath: path, sourcePaneId: paneId }),
        );
        e.dataTransfer.effectAllowed = "move";
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
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClose(path);
          }}
          className="w-3 h-3 flex items-center justify-center"
        >
          <span className="w-2 h-2 rounded-full bg-[#80c8e0] group-hover:hidden" />
          <X
            size={11}
            className="hidden group-hover:block text-[#586478] hover:text-white"
          />
        </span>
      ) : (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClose(path);
          }}
          className="w-3 h-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={11} className="text-[#586478] hover:text-white" />
        </span>
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
  onReorder,
  paneId,
}: Props) {
  // PointerSensor with a small activation distance so clicks still work
  // and only intentional drags trigger the reorder
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = openTabs.indexOf(active.id as string);
    const newIndex = openTabs.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(openTabs, oldIndex, newIndex));
  };

  if (openTabs.length === 0) {
    return (
      <div className="h-9 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-center px-3">
        <span className="text-[11px] text-neutral-600">no file open</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={openTabs}
        strategy={horizontalListSortingStrategy}
      >
        <div className="h-9 bg-[#0a0c12] border-b border-[#222838] flex items-end overflow-x-auto px-1 gap-0.5 scrollbar-none">
          {openTabs.map((path) => (
            <SortableTab
              key={path}
              path={path}
              isActive={path === activeFile}
              isDirty={!!dirtyFiles[path]}
              onSelect={onSelect}
              onClose={onClose}
              paneId={paneId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
