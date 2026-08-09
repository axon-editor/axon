import { Columns2, Eye, FileText } from "lucide-react";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

export type MarkdownPreviewMode = "editor" | "split";

interface Props {
  filePath: string;
  mode: MarkdownPreviewMode;
  onChangeMode: (mode: MarkdownPreviewMode) => void;
  onOpenPreview?: (filePath: string) => void;
}

function modeButtonClassName(active: boolean) {
  return `cursor-pointer rounded p-1 transition-colors ${
    active
      ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
      : "text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
  }`;
}

export default function MarkdownEditorModeToolbar({
  filePath,
  mode,
  onChangeMode,
  onOpenPreview,
}: Props) {
  return (
    <div className="flex items-center justify-end gap-1 border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-3 py-1">
      <Tooltip label="Editor" side="bottom">
        <button
          type="button"
          onClick={() => onChangeMode("editor")}
          aria-label="Editor"
          className={modeButtonClassName(mode === "editor")}
        >
          <FileText size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Split preview" side="bottom">
        <button
          type="button"
          onClick={() => onChangeMode("split")}
          aria-label="Split preview"
          className={modeButtonClassName(mode === "split")}
        >
          <Columns2 size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Preview" side="bottom">
        <button
          type="button"
          onClick={() => onOpenPreview?.(filePath)}
          aria-label="Preview"
          className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <Eye size={13} />
        </button>
      </Tooltip>
    </div>
  );
}
