import { FilePlus } from "lucide-react";
import { publicAsset } from "@axon-editor/renderer/shared/lib/assets";

export default function WorkspaceBlankPane({
  onNewFile,
}: {
  onNewFile: () => void;
}) {
  return (
    <div className="flex h-full select-none items-center justify-center bg-[var(--axon-editor-background)] px-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src={publicAsset("axon.png")}
          alt="Axon"
          className="h-20 w-20 object-contain opacity-10"
        />
        <div className="flex flex-col items-center gap-1">
          <div className="axon-workspace-blank__title text-[18px] font-medium text-[var(--axon-editor-foreground)] opacity-55">
            Axon
          </div>
          <p className="max-w-xs text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-35">
            Open a file from the sidebar when you are ready to shape the next
            part of this workspace.
          </p>
          <button
            type="button"
            onClick={onNewFile}
            className="mt-3 flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-70 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <FilePlus size={13} />
            new file
          </button>
        </div>
      </div>
    </div>
  );
}
