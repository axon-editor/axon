import { type FileNode } from "../../../shared/lib/api";
import { publicAsset } from "../../../shared/lib/assets";
import { type GitTreeDecoration } from "..";
import FileTreeNode from "./FileTreeNode";
import InlineCreateRow, { type InlineCreateTarget } from "./InlineCreateRow";

interface FileTreeProps {
  tree: FileNode | null;
  loading: boolean;
  activeFile: string | null;
  revealPath: string | null;
  gitDecorations: Map<string, GitTreeDecoration>;
  ignoredPaths: Set<string>;
  inlineCreate: InlineCreateTarget | null;
  onOpenFolderPicker: () => void;
  onFileSelect: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void;
  onMove: (sourcePath: string, targetDirPath: string) => void;
  onInlineCreateCancel: () => void;
  onInlineCreateCreated: (path: string, isDir: boolean) => void | Promise<void>;
}

export default function FileTree({
  tree,
  loading,
  activeFile,
  revealPath,
  gitDecorations,
  ignoredPaths,
  inlineCreate,
  onOpenFolderPicker,
  onFileSelect,
  onContextMenu,
  onMove,
  onInlineCreateCancel,
  onInlineCreateCreated,
}: FileTreeProps) {
  const showEmptySidebar =
    !loading && (!tree || ((tree.children?.length ?? 0) === 0 && !inlineCreate));

  if (loading) {
    return (
      <div className="px-4 py-2 text-[12px] text-[#364050]">loading...</div>
    );
  }

  if (showEmptySidebar) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <img
          src={publicAsset("axon.png")}
          alt="Axon"
          className="mb-3 h-12 w-12 opacity-25"
          draggable={false}
        />
        <div className="text-[12px] font-medium text-[#c8d0e0]">
          no folder open
        </div>
        <div className="mt-1 max-w-[160px] text-[11px] leading-4 text-[#586478]">
          use the folder button above to open a workspace.
        </div>
        <button
          type="button"
          onClick={onOpenFolderPicker}
          className="mt-4 flex h-7 cursor-pointer items-center rounded border border-[#222838] px-3 text-[11px] text-[#9aa4b8] transition-colors hover:border-[#3a455a] hover:bg-[#11151c] hover:text-white"
        >
          open folder
        </button>
      </div>
    );
  }

  if (!tree) return null;

  return (
    <>
      {inlineCreate?.parentPath === tree.path && (
        <InlineCreateRow
          target={inlineCreate}
          depth={0}
          onCancel={onInlineCreateCancel}
          onCreated={onInlineCreateCreated}
        />
      )}

      {tree.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          activeFile={activeFile}
          onFileSelect={onFileSelect}
          onContextMenu={onContextMenu}
          onMove={onMove}
          revealPath={revealPath}
          gitDecorations={gitDecorations}
          ignoredPaths={ignoredPaths}
          inlineCreate={inlineCreate}
          onInlineCreateCancel={onInlineCreateCancel}
          onInlineCreateCreated={onInlineCreateCreated}
        />
      ))}
    </>
  );
}
