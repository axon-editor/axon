import { type ReactNode } from "react";
import MarkdownPreview from "@axon-builtin-markdown/MarkdownPreview";
import { type MarkdownPreviewMode } from "./MarkdownEditorModeToolbar";

interface Props {
  content: string;
  editor: ReactNode;
  filePath: string;
  folderPath: string | null;
  mode: MarkdownPreviewMode;
  onContentChange: (content: string) => void;
  onOpenFile?: (filePath: string) => void;
}

export default function EditorPreviewLayout({
  content,
  editor,
  filePath,
  folderPath,
  mode,
  onContentChange,
  onOpenFile,
}: Props) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {mode === "editor" && editor}
      {mode === "split" && (
        <>
          {editor}
          <div className="w-px shrink-0 bg-[var(--axon-panel-border)]" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <MarkdownPreview
              content={content}
              filePath={filePath}
              folderPath={folderPath}
              onOpenFile={onOpenFile}
              onContentChange={onContentChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
