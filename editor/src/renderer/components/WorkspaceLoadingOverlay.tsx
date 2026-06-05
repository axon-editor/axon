import { publicAsset } from "../lib/assets";

export default function WorkspaceLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#080a10]/72 backdrop-blur-sm">
      <div className="w-[360px] rounded-lg border border-[#222838] bg-[#10131b]/92 px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
        <div className="flex items-center gap-3">
          <img
            src={publicAsset("axon.png")}
            alt="Axon"
            className="h-11 w-11 object-contain opacity-65"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-[#263047]" />
            <div className="h-2.5 w-48 animate-pulse rounded bg-[#1a2030]" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-[#1a2030]" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-[#171c2a]" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-[#171c2a]" />
        </div>
      </div>
    </div>
  );
}
