import { useEffect, useState } from "react";
import { readFile } from "@axon-editor/renderer/shared/lib/api";
import {
  getModel,
  onModelReady,
} from "@axon-editor/renderer/features/editor/lib/monacoModels";
import MarkdownPreview from "./MarkdownPreview";

interface Props {
  filePath: string;
  folderPath: string | null;
  onOpenFile?: (path: string) => void;
}

export default function MarkdownPreviewTab({
  filePath,
  folderPath,
  onOpenFile,
}: Props) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    />
  );
}
