// Right-side placeholder for the future Axon Agent surface.
// It is intentionally self-contained so the actual AI chat/tools feature can
// replace this panel without touching the editor layout again.
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { publicAsset } from "../../shared/lib/assets";
import Tooltip from "../../shared/components/Tooltip";

interface Props {
  onClose: () => void;
}

const agentMessages = [
  "AI is coming soon",
  "Axon Agent is warming up",
  "Workspace help is loading",
  "Smart edits are almost here",
  "Build with an AI pair soon",
];

const TYPE_INTERVAL_MS = 58;
const DELETE_INTERVAL_MS = 34;
const HOLD_INTERVAL_MS = 3000;

export default function AxonAgentSidebar({ onClose }: Props) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(0);
  const [mode, setMode] = useState<"typing" | "holding" | "deleting">(
    "typing",
  );
  const activeMessage = agentMessages[messageIndex] ?? agentMessages[0];
  const visibleMessage = activeMessage.slice(0, visibleLength);

  useEffect(() => {
    // One timer owns the whole typewriter lifecycle. Keeping the animation in
    // React state avoids stacking five independent CSS animations on top of
    // each other, which made the previous version render overlapping text.
    const timeout = window.setTimeout(
      () => {
        if (mode === "typing") {
          if (visibleLength < activeMessage.length) {
            setVisibleLength((length) => length + 1);
            return;
          }
          setMode("holding");
          return;
        }

        if (mode === "holding") {
          setMode("deleting");
          return;
        }

        if (visibleLength > 0) {
          setVisibleLength((length) => length - 1);
          return;
        }

        setMessageIndex((index) => (index + 1) % agentMessages.length);
        setMode("typing");
      },
      mode === "holding"
        ? HOLD_INTERVAL_MS
        : mode === "deleting"
          ? DELETE_INTERVAL_MS
          : TYPE_INTERVAL_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [activeMessage.length, mode, visibleLength]);

  return (
    <aside
      className="relative flex w-[260px] shrink-0 flex-col overflow-hidden border-l bg-[var(--axon-panel-background)]"
      style={{ borderColor: "var(--axon-panel-border)" }}
    >
      <style>
        {`
          @keyframes axon-agent-caret {
            0%, 45% { opacity: 1; }
            46%, 100% { opacity: 0; }
          }
          @keyframes axon-agent-text-wave {
            0%, 100% { text-shadow: 0 0 0 rgba(128, 200, 224, 0); }
            50% { text-shadow: 0 0 14px rgba(128, 200, 224, 0.22); }
          }
        `}
      </style>

      <div
        className="flex h-9 shrink-0 items-center justify-between border-b px-3"
        style={{ borderColor: "var(--axon-panel-border)" }}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa4b8]">
          <Sparkles size={13} className="text-[#80c8e0]" />
          Axon Agent
        </div>
        <Tooltip label="Close Axon Agent" side="left">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Axon Agent"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
          >
            <X size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 text-center">
        <img
          src={publicAsset("axon.png")}
          alt="Axon"
          className="mb-5 h-20 w-20 object-contain opacity-10"
          draggable={false}
        />

        <h2 className="relative h-6 w-full text-center text-[16px] font-semibold text-[#dce4f0]">
          <span className="absolute left-1/2 top-0 inline-flex -translate-x-1/2">
            <span
              className="block whitespace-nowrap"
              style={{
                animation: "axon-agent-text-wave 3s ease-in-out infinite",
              }}
            >
              {visibleMessage}
            </span>
            <span
              className="ml-0.5 h-5 w-px bg-[#80c8e0]"
              style={{
                animation: "axon-agent-caret 1s steps(1, end) infinite",
              }}
              aria-hidden="true"
            />
          </span>
        </h2>
        <p className="mt-2 max-w-[190px] text-[11px] leading-5 text-[#586478]">
          Axon Agent will help read your workspace, explain code, and prepare
          edits when the AI layer is ready.
        </p>

        <div className="mt-5 rounded-full border border-[#222838] bg-[#0d111a] px-3 py-1 text-[10px] text-[#80c8e0]">
          building quietly
        </div>
      </div>
    </aside>
  );
}
