import { publicAsset } from "../../shared/lib/assets";

export default function WorkspaceBlankPane() {
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
        </div>
      </div>
    </div>
  );
}
