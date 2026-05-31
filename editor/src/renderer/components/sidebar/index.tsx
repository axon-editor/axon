// Collapsible file explorer sidebar.
// Composes FileTreeNode for the tree and ContextMenu for right click actions.
// Handles file move via drag and drop by calling the Go backend move endpoint
// and refreshing the tree on success.
import { useState } from "react";
import { FolderPlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { type FileNode, moveEntry } from "../../lib/api";
import FileTreeNode from "./FileTreeNode";
import ContextMenu from "./ContextMenu";

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  loading: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

export default function Sidebar({
  tree,
  folderPath,
  activeFile,
  onFileSelect,
  onOpenFolder,
  onRefresh,
  loading,
  collapsed,
  onCollapsedChange,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  // move a file or folder to a new directory then refresh the tree
  const handleMove = async (sourcePath: string, targetDir: string) => {
    try {
      await moveEntry(sourcePath, targetDir);
      onRefresh();
    } catch (err) {
      console.error("move failed:", err);
    }
  };

  return (
    <>
      <div className="flex h-full">
        {!collapsed && (
          <div className="w-52 bg-[#0a0c12] border-r border-[#222838] flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-[#222838] pt-8"
              style={{ WebkitAppRegion: "drag" } as any}
            >
              <span className="text-[10px] text-[#586478] uppercase tracking-widest truncate">
                {folderPath ? folderPath.split("/").pop() : "Explorer"}
              </span>
              <div
                className="flex items-center gap-2 shrink-0"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                <button
                  onClick={onOpenFolder}
                  className="text-[#586478] hover:text-[#80c8e0] transition-colors cursor-pointer flex items-center justify-center"
                  title="Open folder"
                >
                  <FolderPlus size={13} />
                </button>
                <button
                  onClick={() => onCollapsedChange(true)}
                  className="text-[#586478] hover:text-[#80c8e0] transition-colors cursor-pointer flex items-center justify-center"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose size={13} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {loading && (
                <div className="px-4 py-2 text-[12px] text-[#364050]">
                  loading...
                </div>
              )}
              {!loading && !tree && (
                <div
                  onClick={onOpenFolder}
                  className="px-4 py-3 text-[12px] text-[#364050] hover:text-[#586478] cursor-pointer transition-colors"
                >
                  open a folder to start
                </div>
              )}
              {!loading && tree && (
                <FileTreeNode
                  node={tree}
                  activeFile={activeFile}
                  onFileSelect={onFileSelect}
                  onContextMenu={handleContextMenu}
                  onMove={handleMove}
                />
              )}
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-9 bg-[#0a0c12] border-r border-[#222838] flex flex-col items-center pt-8 gap-3">
            <button
              onClick={() => onCollapsedChange(false)}
              className="text-[#586478] hover:text-[#80c8e0] transition-colors cursor-pointer"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}
