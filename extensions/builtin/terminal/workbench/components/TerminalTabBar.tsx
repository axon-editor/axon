/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Renders the terminal tab strip with drag to reorder. Terminal tabs reuse the
// shared ChromeTab shell so the panel and the editor panes keep one tab shape,
// and they reuse the editor tab bar's dnd-kit wiring so a drag behaves the same
// in both places. Order is reported back to the session manager as ids, which
// is what keeps a drag from touching any live PTY.
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ChromeTab from "@axon-editor/renderer/features/editor/components/tabs/ChromeTab";

export interface TerminalTabItem {
  id: string;
  title: string;
}

interface Props {
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  active: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

function SortableTerminalTab({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: TerminalTabItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <ChromeTab
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      label={tab.title}
      active={isActive}
      closeLabel={`Close ${tab.title}`}
      closeButtonClassName="h-7 w-7"
      onClick={() => onSelect(tab.id)}
      onClose={(event) => {
        event.stopPropagation();
        onClose(tab.id);
      }}
    />
  );
}

export default function TerminalTabBar({
  tabs,
  activeTabId,
  active,
  onSelect,
  onClose,
  onReorder,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const ids = tabs.map((tab) => tab.id);
    const from = ids.indexOf(String(dragged.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tabs.map((tab) => tab.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden">
          {tabs.map((tab) => (
            <SortableTerminalTab
              key={tab.id}
              tab={tab}
              isActive={active && tab.id === activeTabId}
              onSelect={onSelect}
              onClose={onClose}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
