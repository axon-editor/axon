import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
} from "lucide-react";
import { type GitGraphTreeNode } from "./gitGraphTree";

export default function CommitFileTree({
  nodes,
  onOpenFile,
  depth = 0,
}: {
  nodes: GitGraphTreeNode[];
  onOpenFile: (node: GitGraphTreeNode) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  return nodes.map((node) => {
    const folder = node.children.length > 0;
    const closed = collapsed.has(node.path);
    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => {
            if (!folder) {
              onOpenFile(node);
              return;
            }
            setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(node.path)) next.delete(node.path);
              else next.add(node.path);
              return next;
            });
          }}
          className="grid h-7 w-full grid-cols-[14px_14px_minmax(0,1fr)_20px] items-center gap-1.5 pr-3 text-left text-[11px] text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)]"
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          {folder ? (
            closed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )
          ) : (
            <span />
          )}
          {folder ? (
            closed ? (
              <Folder size={12} />
            ) : (
              <FolderOpen size={12} />
            )
          ) : (
            <FileCode2 size={12} className="opacity-45" />
          )}
          <span className="truncate">{node.name}</span>
          <span className="text-right font-mono text-[10px] text-[var(--axon-syntax-function)]">
            {node.file?.status.slice(0, 1).toUpperCase() ?? ""}
          </span>
        </button>
        {folder && !closed ? (
          <CommitFileTree
            nodes={node.children}
            onOpenFile={onOpenFile}
            depth={depth + 1}
          />
        ) : null}
      </div>
    );
  });
}
