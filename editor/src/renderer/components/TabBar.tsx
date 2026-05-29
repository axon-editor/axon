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
}

function SortableTab({
  path,
  isActive,
  isDirty,
  onSelect,
  onClose,
}: {
  path: string;
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
  } = useSortable({ id: path });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // lift the tab visually while dragging
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
      className={`group flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-t
        border border-b-0 cursor-pointer transition-colors shrink-0 select-none
        ${
          isActive
            ? "bg-[#1e1e1e] border-[#2a2a2a] text-white"
            : "bg-transparent border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-[#181818]"
        }`}
    >
      {isDirty ? (
        <span
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose(path);
          }}
          className="w-3 h-3 flex items-center justify-center"
        >
          <span className="w-2 h-2 rounded-full bg-[#6c5ce7] group-hover:hidden" />
          <X
            size={11}
            className="hidden group-hover:block text-neutral-400 hover:text-white"
          />
        </span>
      ) : (
        <span
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose(path);
          }}
          className="w-3 h-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={11} className="text-neutral-400 hover:text-white" />
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
        <div className="h-9 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-end overflow-x-auto px-1 gap-0.5 scrollbar-none">
          {openTabs.map((path) => (
            <SortableTab
              key={path}
              path={path}
              isActive={path === activeFile}
              isDirty={!!dirtyFiles[path]}
              onSelect={onSelect}
              onClose={onClose}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
