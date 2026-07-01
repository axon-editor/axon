import { publicAsset } from "../lib/assets";

export default function WorkspaceLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--axon-editor-background)]">
      <div className="w-[360px] rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-5 py-5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-3">
          <img
            src={publicAsset("axon.png")}
            alt="Axon"
            className="h-11 w-11 object-contain opacity-65"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-[var(--axon-panel-overlay-hover)]" />
            <div className="h-2.5 w-48 rounded bg-[var(--axon-panel-overlay-hover)] opacity-70" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="h-3 w-full rounded bg-[var(--axon-panel-overlay-hover)]" />
          <div className="h-3 w-10/12 rounded bg-[var(--axon-panel-overlay-hover)] opacity-70" />
          <div className="h-3 w-8/12 rounded bg-[var(--axon-panel-overlay-hover)] opacity-70" />
        </div>
      </div>
    </div>
  );
}
