import { memo, useCallback, useEffect, useState } from "react";
import { readFile } from "@axon-editor/renderer/shared/lib/api";
import {
  getModel,
  onModelReady,
} from "@axon-editor/renderer/features/editor/lib/buffer/monacoModels";
import MarkdownPreview from "./MarkdownPreview";

interface Props {
  filePath: string;
  folderPath: string | null;
  onOpenFile?: (path: string) => void;
}

function MarkdownPreviewTab({ filePath, folderPath, onOpenFile }: Props) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleContentChange = useCallback(
    (nextContent: string) => {
      const model = getModel(filePath);
      if (model && !model.isDisposed()) {
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: nextContent }],
          () => null,
        );
        return;
      }

      // A standalone preview can outlive its source editor model. In that case
      // the task toggle is still a deliberate edit, so I persist it through the
      // workspace capability instead of presenting an interactive checkbox that
      // silently resets as soon as the preview rerenders.
      setContent(nextContent);
      const separatorIndex = Math.max(
        filePath.lastIndexOf("/"),
        filePath.lastIndexOf("\\"),
      );
      const writeRoot =
        folderPath ??
        (separatorIndex > 0 ? filePath.slice(0, separatorIndex) : filePath);
      void window.axon
        .writeTextFile(filePath, nextContent, writeRoot)
        .catch((writeError) =>
          setError(
            writeError instanceof Error
              ? writeError.message
              : "The Markdown task could not be updated.",
          ),
        );
    },
    [filePath, folderPath],
  );

  useEffect(() => {
    let cancelled = false;
    let contentUpdateTimer: number | null = null;
    let modelContentDisposable: { dispose(): void } | null = null;
    setError(null);

    const bindModel = (model: NonNullable<ReturnType<typeof getModel>>) => {
      if (cancelled || model.isDisposed()) return;
      modelContentDisposable?.dispose();
      setContent(model.getValue());
      modelContentDisposable = model.onDidChangeContent(() => {
        if (contentUpdateTimer !== null) {
          window.clearTimeout(contentUpdateTimer);
        }
        contentUpdateTimer = window.setTimeout(() => {
          contentUpdateTimer = null;
          if (!cancelled && !model.isDisposed()) {
            setContent(model.getValue());
          }
        }, 80);
      });
    };

    const modelReadyDisposable = onModelReady(filePath, bindModel);

    readFile(filePath)
      .then((file) => {
        if (!cancelled && !getModel(filePath)) setContent(file.content);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Markdown preview could not load.",
          );
        }
      });

    return () => {
      cancelled = true;
      if (contentUpdateTimer !== null) {
        window.clearTimeout(contentUpdateTimer);
      }
      modelContentDisposable?.dispose();
      modelReadyDisposable.dispose();
    };
  }, [filePath]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--axon-editor-background)] p-6 text-center">
        <div className="max-w-md rounded-md border border-[#3a2430] bg-[var(--axon-panel-background)] p-4 text-[12px] leading-5 text-[#ff9aa8]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <MarkdownPreview
      content={content}
      filePath={filePath}
      folderPath={folderPath}
      onOpenFile={onOpenFile}
      onContentChange={handleContentChange}
    />
  );
}

// Git status is intentionally refreshed in the workbench every two seconds.
// The preview's file identity does not change during that heartbeat, so letting
// the parent update walk this subtree would repeatedly parse Markdown and can
// remount images, videos, highlighted code, and Mermaid output. Memoization
// keeps the rendered document stable until one of its real inputs changes.
export default memo(MarkdownPreviewTab);
