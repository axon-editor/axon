import { AlertCircle, ListChecks, X } from "lucide-react";
import Tooltip from "./Tooltip";

export type BottomPanelTab = "problems" | "output";

interface Props {
  open: boolean;
  activeTab: BottomPanelTab;
  onActiveTabChange: (tab: BottomPanelTab) => void;
  onClose: () => void;
}

const tabs: Array<{
  id: BottomPanelTab;
  label: string;
  icon: typeof AlertCircle;
}> = [
  { id: "problems", label: "Problems", icon: AlertCircle },
  { id: "output", label: "Output", icon: ListChecks },
];

export function BottomPanelHeader({
  activeTab,
  onActiveTabChange,
  onClose,
}: Omit<Props, "open">) {
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onActiveTabChange(tab.id)}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[12px] transition-colors ${
              active
                ? "bg-[#1e2430] text-white"
                : "text-[#586478] hover:bg-[#141923] hover:text-[#c8d0e0]"
            }`}
          >
            <Icon size={13} />
            {tab.label}
            {tab.id === "problems" && (
              <span className="rounded bg-[#151923] px-1.5 text-[10px] text-[#586478]">
                0
              </span>
            )}
          </button>
        );
      })}

      <Tooltip label="Close panel" side="top">
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
        >
          <X size={13} />
        </button>
      </Tooltip>
    </div>
  );
}

export function BottomPanelContent({ activeTab }: { activeTab: BottomPanelTab }) {
  return (
    <>
      {activeTab === "problems" && (
        <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[#586478]">
          No problems in this workspace yet.
        </div>
      )}

      {activeTab === "output" && (
        <div className="h-full overflow-y-auto px-4 py-3 font-mono text-[11px] leading-5 text-[#647086]">
          <div>Axon output panel ready.</div>
          <div className="text-[#3f485a]">
            Build, task, extension, and AI tool logs will appear here.
          </div>
        </div>
      )}
    </>
  );
}

export default function BottomPanel({
  open,
  activeTab,
  onActiveTabChange,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="h-56 shrink-0 border-t border-[#202533] bg-[#0a0c12] text-[#9aa4b8]">
      <div className="flex h-9 items-center justify-between border-b border-[#202533] px-2">
        <BottomPanelHeader
          activeTab={activeTab}
          onActiveTabChange={onActiveTabChange}
          onClose={onClose}
        />
      </div>

      <div className="h-[calc(100%-36px)]">
        <BottomPanelContent activeTab={activeTab} />
      </div>
    </div>
  );
}
