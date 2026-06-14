import { useEffect, useRef, useState } from "react";
import { createDir, createFile } from "../../../shared/lib/api";
import { getFileIcon, getFolderIcon } from "./lib/fileIcons";

export type InlineCreateKind = "file" | "folder";

export interface InlineCreateTarget {
  parentPath: string;
  kind: InlineCreateKind;
  existingNames: string[];
}

interface Props {
  target: InlineCreateTarget;
  depth: number;
  onCancel: () => void;
  onCreated: (path: string, isDir: boolean) => void | Promise<void>;
}

const TREE_BASE_INDENT = 8;
const TREE_DEPTH_WIDTH = 13;

function joinTreePath(parentPath: string, name: string) {
  const separator = parentPath.includes("\\") ? "\\" : "/";
  return `${parentPath.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export default function InlineCreateRow({
  target,
  depth,
  onCancel,
  onCreated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const [value, setValue] = useState("");
  const trimmedName = value.trim();
  const isDuplicateName =
    !!trimmedName && target.existingNames.includes(trimmedName);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [target.parentPath, target.kind]);

  const commitOrCancel = async () => {
    if (committedRef.current) return;
    committedRef.current = true;

    if (!trimmedName) {
      onCancel();
      return;
    }

    if (isDuplicateName) {
      committedRef.current = false;
      inputRef.current?.focus();
      return;
    }

    const createdPath = joinTreePath(target.parentPath, trimmedName);
    if (target.kind === "folder") {
      await createDir(createdPath);
    } else {
      await createFile(createdPath);
    }

    await onCreated(createdPath, target.kind === "folder");
  };

  return (
    <div
      className="relative flex items-center gap-1.5 py-1 pr-2"
      style={{
        paddingLeft: `${TREE_BASE_INDENT + depth * TREE_DEPTH_WIDTH}px`,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="flex h-4 w-3 shrink-0 items-center justify-center text-[#364050]" />
      <span className="flex shrink-0 items-center text-[#80c8e0]">
        {target.kind === "folder" ? (
          getFolderIcon(trimmedName || "new-folder", false, 14)
        ) : (
          getFileIcon(trimmedName || "new-file.ts", 14)
        )}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void commitOrCancel()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commitOrCancel();
          if (event.key === "Escape") onCancel();
        }}
        placeholder={target.kind === "folder" ? "new-folder" : "new-file.ts"}
        className={`h-6 min-w-0 flex-1 rounded border bg-[#090b11] px-2 text-[12px] text-white outline-none transition-colors ${
          isDuplicateName
            ? "border-red-500"
            : "border-[#2b3448] focus:border-[#80c8e0]"
        }`}
      />
    </div>
  );
}
