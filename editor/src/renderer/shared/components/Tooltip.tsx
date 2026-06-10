import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface Props {
  label: string;
  side?: TooltipSide;
  delayMs?: number;
  triggerClassName?: string;
  children: ReactNode;
}

const GAP = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Tooltip is intentionally a wrapper instead of a custom button because most
// controls in Axon already own their click, drag-region, and active-state
// behavior. Keeping the tooltip separate lets every icon button share one
// hover/focus presentation without changing those button contracts.
export default function Tooltip({
  label,
  side = "bottom",
  delayMs = 0,
  triggerClassName = "inline-flex",
  children,
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const clearOpenTimer = () => {
    if (openTimerRef.current === null) return;
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  };

  const show = () => {
    clearOpenTimer();
    if (delayMs <= 0) {
      setOpen(true);
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpen(true);
    }, delayMs);
  };

  const hide = () => {
    clearOpenTimer();
    setOpen(false);
  };

  useEffect(() => {
    return clearOpenTimer;
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();

    let top = trigger.bottom + GAP;
    let left = trigger.left + trigger.width / 2 - tooltip.width / 2;

    if (side === "top") {
      top = trigger.top - tooltip.height - GAP;
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
    }

    if (side === "left") {
      top = trigger.top + trigger.height / 2 - tooltip.height / 2;
      left = trigger.left - tooltip.width - GAP;
    }

    if (side === "right") {
      top = trigger.top + trigger.height / 2 - tooltip.height / 2;
      left = trigger.right + GAP;
    }

    setPosition({
      top: clamp(top, GAP, window.innerHeight - tooltip.height - GAP),
      left: clamp(left, GAP, window.innerWidth - tooltip.width - GAP),
    });
  }, [open, side, label]);

  return (
    <span
      ref={triggerRef}
      className={triggerClassName}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={tooltipRef}
            className="pointer-events-none fixed z-[100] whitespace-nowrap rounded border border-[#222838] bg-[#14161e] px-2 py-1 text-[11px] text-[#c8d0e0] shadow-xl"
            style={{ top: position.top, left: position.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
