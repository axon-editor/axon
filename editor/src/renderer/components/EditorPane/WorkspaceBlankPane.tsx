import { publicAsset } from "../../lib/assets";

export default function WorkspaceBlankPane() {
  return (
    <div className="flex h-full select-none items-center justify-center bg-[#0b0e14] px-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src={publicAsset("axon.png")}
          alt="Axon"
          className="h-20 w-20 object-contain opacity-10"
        />
        <div className="flex flex-col items-center gap-1">
          <div className="axon-workspace-blank__title text-[18px] font-medium text-[#5d687a]">
            Axon
          </div>
          <p className="max-w-xs text-[12px] leading-5 text-[#3d4655]">
            Open a file from the sidebar when you are ready to shape the next
            part of this workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
