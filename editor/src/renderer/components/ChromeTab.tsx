// Shared tab shell for editor panes and terminal tabs.
// Keeping this shape in one component prevents the two tab surfaces from
// drifting apart as the editor grows: close affordance, rounded active state,
// hover treatment, dirty indicator, and text truncation all stay consistent.
import {
  forwardRef,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { X } from "lucide-react";
import Tooltip from "./Tooltip";

interface Props extends HTMLAttributes<HTMLDivElement> {
  label: string;
  active: boolean;
  dirty?: boolean;
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

  return (
    <div
      ref={ref}
      {...props}
      className={`group flex h-7 min-w-0 max-w-32 shrink-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden rounded border px-2 text-[11px] transition-colors ${
        active
          ? "border-[#2a3346] bg-[#151923] text-[#dce4f0]"
          : "border-transparent bg-transparent text-[#7b8496] hover:bg-[#111722] hover:text-neutral-100"
      } ${className}`}
    >
      {tooltipLabel ? (
        <Tooltip
          label={tooltipLabel}
          side="bottom"
          delayMs={tooltipDelayMs}
          triggerClassName="min-w-0 flex-1 pr-1"
        >
          <span className="block truncate">{label}</span>
        </Tooltip>
      ) : (
        <span className="min-w-0 flex-1 truncate pr-1">{label}</span>
      )}

      {dirty ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#80c8e0] group-hover:hidden" />
      ) : null}

      {onClose ? (
        <Tooltip label={closeLabel} side="bottom">
          <button
            type="button"
            aria-label={closeLabel}
            onPointerDown={handleClosePointerDown}
            onClick={onClose}
            className={`ml-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded bg-[#202838] text-[#7b8496] transition hover:bg-[#2a3346] hover:text-white ${
              dirty ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <X size={11} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
});

export default ChromeTab;
