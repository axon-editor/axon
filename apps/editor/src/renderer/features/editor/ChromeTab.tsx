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
import Tooltip from "../../shared/components/Tooltip.tsx";
interface Props extends HTMLAttributes<HTMLDivElement> {
  label: string;
  active: boolean;
  dirty?: boolean;
  deleted?: boolean;
  pinned?: boolean;
  closeLabel?: string;
  closeButtonClassName?: string;
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
    closeButtonClassName = "h-5 w-5",
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
      ? "border-[var(--axon-panel-border)] bg-[var(--axon-tab-active-background)] text-[var(--axon-syntax-method)] before:bg-[var(--axon-syntax-method)]"
      : "border-transparent bg-transparent text-[var(--axon-syntax-method)] opacity-70 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-95 before:bg-transparent"
    : active
      ? "border-[var(--axon-panel-border)] bg-[var(--axon-tab-active-background)] text-[var(--axon-editor-foreground)] before:bg-[var(--axon-syntax-function)]"
      : "border-transparent bg-transparent text-[var(--axon-editor-foreground)] opacity-58 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-95 before:bg-transparent";

  return (
    <div
      ref={ref}
      {...props}
      className={`group relative flex h-9 w-fit min-w-[92px] max-w-[220px] shrink-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden border-r px-2.5 pl-3 text-[12px] transition-colors before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-r ${stateClass} ${className}`}
    >
      {pinned ? (
        <Pin
          size={12}
          className="shrink-0 text-[var(--axon-syntax-function)]"
        />
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
        <span
          className={`min-w-0 flex-auto truncate ${deleted ? "line-through" : ""}`}
        >
          {label}
        </span>
      )}

      {dirty ? (
        <span
          aria-label="Unsaved changes"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${deleted ? "bg-[var(--axon-syntax-method)]" : "bg-[var(--axon-syntax-function)]"
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
            className={`ml-0.5 flex shrink-0 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-0 transition hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 group-hover:opacity-55 focus:opacity-100 ${closeButtonClassName}`}
          >
            <X size={11} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
});

export default ChromeTab;
