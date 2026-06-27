// Renders all open file tabs with drag to reorder and inter-pane drag support.
// Uses dnd-kit metadata instead of raw file-path IDs so the same file can be
// open in multiple panes without confusing the drag target.
// Active tab highlighted, dirty tabs show cyan dot that reveals close on hover.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, PanelRightClose, Pin, PinOff, Terminal as TerminalIcon, X } from "lucide-react";
import ChromeTab from "./ChromeTab";
import {
  getTabDisplayName,
  getTabFilePath,
  getTabTooltipLabel,
  isVirtualTabPath,
} from "./lib/tabIdentity";

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
  deletedFiles?: Set<string>;
  pinnedTabs?: string[];
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onPinTab: (path: string, pinned: boolean) => void;
  onOpenInTerminal?: (path: string) => void;
  paneId: string;
}

interface ContextMenuState {
  path: string;
  x: number;
  y: number;
}

function SortableTab({
  path,
  paneId,
  isActive,
  isDirty,
  isDeleted,
  isPinned,
  onSelect,
  onClose,
  onContextMenu,
}: {
  path: string;
  paneId: string;
  isActive: boolean;
  isDirty: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onContextMenu: (path: string, rect: DOMRect) => void;
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

  const name = getTabDisplayName(path);
  return (
    <ChromeTab
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      label={name}
      active={isActive}
      dirty={isDirty}
      deleted={isDeleted}
      pinned={isPinned}
      tooltipLabel={getTabTooltipLabel(path)}
      tooltipDelayMs={3000}
      closeLabel={`Close ${name}`}
      onClick={() => onSelect(path)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(path, event.currentTarget.getBoundingClientRect());
      }}
      onAuxClick={(e) => {
        if (e.button === 1) onClose(path);
      }}
      onClose={(event) => {
        event.stopPropagation();
        onClose(path);
      }}
    />
  );
}

function ContextMenu({
  menu,
  openTabs,
  onClose,
  onCloseMenu,
  pinnedTabs,
  onPinTab,
  onOpenInTerminal,
}: {
  menu: ContextMenuState;
  openTabs: string[];
  onClose: (path: string) => void;
  onCloseMenu: () => void;
  pinnedTabs: string[];
  onPinTab: (path: string, pinned: boolean) => void;
  onOpenInTerminal?: (path: string) => void;
}) {
  const tabIndex = openTabs.indexOf(menu.path);
  const canCloseRight = tabIndex >= 0 && tabIndex < openTabs.length - 1;
  const canCloseOthers = openTabs.length > 1;
  const isPinned = pinnedTabs.includes(menu.path);
  const realPath = getTabFilePath(menu.path);
  const isVirtualTab = isVirtualTabPath(menu.path);

  const runAction = (action: () => void) => {
    action();
    onCloseMenu();
  };

  const menuItemClass =
    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] text-[#c8d0e0] transition-colors hover:bg-[#1b2030] disabled:cursor-default disabled:text-[#586478] disabled:hover:bg-transparent";

  return createPortal(
    <div
      className="fixed z-[200] min-w-48 overflow-hidden rounded-md border border-[#2a3346] bg-[#10131a] py-1 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(() => onClose(menu.path))}
      >
        <X size={13} />
        <span>Close</span>
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(() => onPinTab(menu.path, !isPinned))}
      >
        {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
        <span>{isPinned ? "Unpin tab" : "Pin tab"}</span>
      </button>
      <button
        type="button"
        disabled={!canCloseOthers}
        className={menuItemClass}
        onClick={() =>
          runAction(() =>
            openTabs
              .filter((path) => path !== menu.path)
              .filter((path) => !pinnedTabs.includes(path))
              .forEach((path) => onClose(path)),
          )
        }
      >
        <PanelRightClose size={13} />
        <span>Close others</span>
      </button>
      <button
        type="button"
        disabled={!canCloseRight}
        className={menuItemClass}
        onClick={() =>
          runAction(() =>
            openTabs
              .slice(tabIndex + 1)
              .filter((path) => !pinnedTabs.includes(path))
              .forEach((path) => onClose(path)),
          )
        }
      >
        <PanelRightClose size={13} />
        <span>Close tabs to right</span>
      </button>
      {onOpenInTerminal ? (
        <button
          type="button"
          disabled={isVirtualTab}
          className={menuItemClass}
          onClick={() => runAction(() => onOpenInTerminal(realPath))}
        >
          <TerminalIcon size={13} />
          <span>Open in terminal</span>
        </button>
      ) : null}
      <button
        type="button"
        disabled={isVirtualTab}
        className={menuItemClass}
        onClick={() =>
          runAction(() => {
            void window.axon.copyText(realPath);
          })
        }
      >
        <Copy size={13} />
        <span>Copy path</span>
      </button>
    </div>,
    document.body,
  );
}

export default function TabBar({
  openTabs,
  activeFile,
  dirtyFiles,
  deletedFiles,
  pinnedTabs = [],
  onSelect,
  onClose,
  onPinTab,
  onOpenInTerminal,
  paneId,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  if (openTabs.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-[#1d2432] bg-[#090b10] px-3">
        <span className="text-[11px] text-[#364050]">no file open</span>
      </div>
    );
  }

  return (
    <SortableContext
      items={openTabs.map((path) => getTabDragId(paneId, path))}
      strategy={horizontalListSortingStrategy}
    >
      <div className="flex h-9 items-stretch overflow-x-auto border-b border-[#1d2432] bg-[#090b10] scrollbar-none">
        {openTabs.map((path) => (
          <SortableTab
            key={path}
            path={path}
            paneId={paneId}
            isActive={path === activeFile}
            isDirty={!!dirtyFiles[path]}
            isDeleted={deletedFiles?.has(path) ?? false}
            isPinned={pinnedTabs.includes(path)}
            onSelect={onSelect}
            onClose={onClose}
            onContextMenu={(filePath, rect) =>
              setContextMenu({
                path: filePath,
                x: rect.left,
                y: rect.bottom + 4,
              })
            }
          />
        ))}
        {contextMenu ? (
          <ContextMenu
            menu={contextMenu}
            openTabs={openTabs}
            onClose={onClose}
            onCloseMenu={() => setContextMenu(null)}
            pinnedTabs={pinnedTabs}
            onPinTab={onPinTab}
            onOpenInTerminal={onOpenInTerminal}
          />
        ) : null}
      </div>
    </SortableContext>
  );
}
