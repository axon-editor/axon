// Shared tab shell for editor panes and terminal tabs.
// Axon tabs should feel like editor navigation, not browser chrome: compact,
// predictable, and stable while users move quickly between files. Keeping the
// shape here prevents close buttons, dirty markers, pinned state, and deleted
// state from drifting across every tab surface as the editor grows.
import {
  forwardRef,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Pin, X } from "lucide-react";
import Tooltip from "../../shared/components/Tooltip";

interface Props extends HTMLAttributes<HTMLDivElement> {
  label: string;
  active: boolean;
  dirty?: boolean;
  deleted?: boolean;
  pinned?: boolean;
  closeLabel?: string;
  tooltipLabel?: string;
  tooltipDelayMs?: number;
  onClose?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const ChromeTab = forwardRef<HTMLDivElement, Props>(function ChromeTab(
  {
    label,
    active,
    dirty = false,
    deleted = false,
    pinned = false,
    closeLabel = "Close tab",
    tooltipLabel,
    tooltipDelayMs = 0,
    onClose,
    className = "",
    ...props
  },
  ref,
) {
  const handleClosePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // Drag listeners live on the tab wrapper. Stopping pointer down here keeps
    // the close button from accidentally starting a tab drag before the click
    // handler has a chance to close the tab.
    event.stopPropagation();
  };

  const stateClass = deleted
    ? active
      ? "border-[#3b1f2a] bg-[#1a1016] text-[#ff9aa2] before:bg-[#ff7b72]"
      : "border-transparent bg-transparent text-[#d36b72] hover:bg-[#171017] hover:text-[#ff9aa2] before:bg-transparent"
    : active
      ? "border-[#242b3a] bg-[#111720] text-[#e4ebf6] before:bg-[#80c8e0]"
      : "border-transparent bg-transparent text-[#7c8799] hover:bg-[#10151e] hover:text-[#d7dfec] before:bg-transparent";

  return (
    <div
      ref={ref}
      {...props}
      className={`group relative flex h-9 w-fit min-w-[86px] max-w-[210px] shrink-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden border-r px-2.5 text-[12px] transition-colors before:absolute before:bottom-0 before:left-0 before:right-0 before:h-0.5 ${stateClass} ${className}`}
    >
      {pinned ? (
        <Pin size={12} className="shrink-0 text-[#80c8e0]" />
      ) : null}

      {tooltipLabel ? (
        <Tooltip
          label={tooltipLabel}
          side="bottom"
          delayMs={tooltipDelayMs}
          triggerClassName="min-w-0 flex-auto"
        >
          <span className={`block truncate ${deleted ? "line-through" : ""}`}>
            {label}
          </span>
        </Tooltip>
      ) : (
        <span className={`min-w-0 flex-auto truncate ${deleted ? "line-through" : ""}`}>
          {label}
        </span>
      )}

      {dirty ? (
        <span
          aria-label="Unsaved changes"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            deleted ? "bg-[#ff7b72]" : "bg-[#80c8e0]"
          }`}
        />
      ) : null}

      {onClose ? (
        <Tooltip label={closeLabel} side="bottom">
          <button
            type="button"
            aria-label={closeLabel}
            onPointerDown={handleClosePointerDown}
            onClick={onClose}
            className="ml-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[#687386] opacity-0 transition hover:bg-[#202838] hover:text-white group-hover:opacity-100 focus:opacity-100"
          >
            <X size={11} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
});

export default ChromeTab;
