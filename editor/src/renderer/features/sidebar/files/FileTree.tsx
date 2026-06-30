import { useState } from "react";
import { type FileNode } from "../../../shared/lib/api";
import { publicAsset } from "../../../shared/lib/assets";
import { type GitTreeDecoration } from "..";
import FileTreeNode from "./FileTreeNode";
import InlineCreateRow, { type InlineCreateTarget } from "./InlineCreateRow";

export interface ImportedExternalEntry {
  sourcePath: string;
  targetPath: string;
  isDir: boolean;
}

export type FileTreeOperation =
  | { id: number; type: "created"; path: string; isDir: boolean }
  | { id: number; type: "deleted"; path: string }
  | { id: number; type: "renamed"; oldPath: string; newPath: string }
  | { id: number; type: "moved"; oldPath: string; newPath: string };

interface FileTreeProps {
  tree: FileNode | null;
  loading: boolean;
  activeFile: string | null;
  revealPath: string | null;
  gitDecorations: Map<string, GitTreeDecoration>;
  ignoredPaths: Set<string>;
  inlineCreate: InlineCreateTarget | null;
  operation: FileTreeOperation | null;
  refreshNonce: number;
  onOpenFolderPicker: () => void;
  onOpenDroppedWorkspace: (path: string) => void | Promise<void>;
  onRootContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onFileSelect: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void;
  onMove: (sourcePath: string, targetDirPath: string) => void;
  onImportExternalEntries: (
    sourcePaths: string[],
    targetDirPath: string,
  ) => Promise<ImportedExternalEntry[]>;
  onInlineCreateCancel: () => void;
  onInlineCreateCreated: (path: string, isDir: boolean) => void | Promise<void>;
}

function getExternalDropPaths(dataTransfer: DataTransfer) {
  return window.axon.getDroppedFilePaths(Array.from(dataTransfer.files));
}

function hasExternalFileDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files");
}

export default function FileTree({
  tree,
  loading,
  activeFile,
  revealPath,
  gitDecorations,
  ignoredPaths,
  inlineCreate,
  operation,
  refreshNonce,
  onOpenFolderPicker,
  onOpenDroppedWorkspace,
  onRootContextMenu,
  onFileSelect,
  onContextMenu,
  onMove,
  onImportExternalEntries,
  onInlineCreateCancel,
  onInlineCreateCreated,
}: FileTreeProps) {
  const [emptyDragOver, setEmptyDragOver] = useState(false);
  const showEmptySidebar =
    !loading && (!tree || ((tree.children?.length ?? 0) === 0 && !inlineCreate));

  const handleEmptyDragOver = (event: React.DragEvent) => {
    if (!hasExternalFileDrag(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setEmptyDragOver(true);
  };

  const handleEmptyDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const externalPaths = getExternalDropPaths(event.dataTransfer);
    if (externalPaths.length === 0) {
      setEmptyDragOver(false);
      return;
    }

    setEmptyDragOver(false);

    if (!tree) {
      void onOpenDroppedWorkspace(externalPaths[0]);
      return;
    }

    // An empty workspace still has a real root directory, so dropping onto the
    // empty state should import into that root instead of forcing the user to
    // find a folder row that does not exist yet.
    void onImportExternalEntries(externalPaths, tree.path);
  };

  if (loading) {
    return (
      <div className="px-4 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-35">loading...</div>
    );
  }

  if (showEmptySidebar) {
    return (
      <div
        data-root-context={tree ? "true" : undefined}
        onContextMenu={tree ? onRootContextMenu : undefined}
        onDragEnter={handleEmptyDragOver}
        onDragOver={handleEmptyDragOver}
        onDragLeave={() => setEmptyDragOver(false)}
        onDrop={handleEmptyDrop}
        className={`flex h-full flex-col items-center justify-center px-4 text-center transition-colors ${
          emptyDragOver ? "bg-[var(--axon-sidebar-hover-background)]" : ""
        }`}
      >
        <img
          src={publicAsset("axon.png")}
          alt="Axon"
          className="mb-3 h-12 w-12 opacity-25"
          draggable={false}
        />
        <div className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
          {tree ? "empty workspace" : "no folder open"}
        </div>
        <div className="mt-1 max-w-[160px] text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
          {tree
            ? "drop files here or create something new."
            : "drop a folder here or use the folder button above."}
        </div>
        {!tree && (
          <button
            type="button"
            onClick={onOpenFolderPicker}
            className="mt-4 flex h-7 cursor-pointer items-center rounded border border-[var(--axon-sidebar-border)] px-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
          >
            open folder
          </button>
        )}
      </div>
    );
  }

  if (!tree) return null;

  return (
    <div className="min-w-max pb-1">
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
          onImportExternalEntries={onImportExternalEntries}
          revealPath={revealPath}
          gitDecorations={gitDecorations}
          ignoredPaths={ignoredPaths}
          inlineCreate={inlineCreate}
          operation={operation}
          refreshNonce={refreshNonce}
          onInlineCreateCancel={onInlineCreateCancel}
          onInlineCreateCreated={onInlineCreateCreated}
        />
      ))}
    </div>
  );
}
