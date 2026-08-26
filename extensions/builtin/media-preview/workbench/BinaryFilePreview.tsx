import { FileWarning } from "lucide-react";
import {
  binaryFileKindLabels,
  getKnownBinaryFileKind,
} from "@axon-editor/shared/binaryFiles";

interface Props {
  filePath: string;
  context?: "editor" | "git";
  deleted?: boolean;
}

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export default function BinaryFilePreview({
  filePath,
  context = "editor",
  deleted = false,
}: Props) {
  const kind = getKnownBinaryFileKind(filePath);
  const kindLabel = kind ? binaryFileKindLabels[kind] : "binary file";
  const fileName = getFileName(filePath);

  const message = deleted
    ? `This ${kindLabel} was deleted. The deletion can still be staged and committed, but there is no current file to preview.`
    : context === "git"
      ? `Git detected this ${kindLabel} as binary. It can still be staged and committed, but binary formats do not have a safe line-by-line text diff.`
      : `Axon does not currently have an in-editor viewer for this ${kindLabel}. The file was kept out of the text editor so its binary data is not decoded as source code.`;

  return (
    <div className="flex h-full min-h-[220px] w-full items-center justify-center bg-[var(--axon-editor-background)] px-8 py-10 text-[var(--axon-editor-foreground)]">
      <div className="flex max-w-[460px] flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
          <FileWarning
            size={24}
            className="text-[var(--axon-warning-foreground)]"
          />
        </div>
        <div className="max-w-full truncate text-[13px] font-medium">
          {fileName}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] opacity-40">
          {kindLabel}
        </div>
        <p className="mt-3 text-[12px] leading-5 opacity-55">{message}</p>
      </div>
    </div>
  );
}
