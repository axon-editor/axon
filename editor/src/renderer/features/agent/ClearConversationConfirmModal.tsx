import { AlertTriangle } from "lucide-react";

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ClearConversationConfirmModal(props: Props) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-[#343841] bg-[#101116] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#2a1720] text-[#ff8f8f]">
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[#f2f3f5]">
              Clear conversation?
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[#9aa0aa]">
              This removes the selected Ask Axon conversation from this
              workspace. Other conversations are kept.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[#9aa0aa] transition-colors hover:bg-[#24272f] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            className="h-8 cursor-pointer rounded-md border border-[#5c2a33] bg-[#2a1720] px-3 text-[12px] text-[#ffb1b1] transition-colors hover:border-[#ff8f8f] hover:text-white"
          >
            Clear Conversation
          </button>
        </div>
      </div>
    </div>
  );
}
