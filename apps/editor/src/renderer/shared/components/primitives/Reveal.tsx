/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

// Matches the width transition in App.css. The exit keeps the control mounted
// long enough for the collapse to finish before React removes it.
const REVEAL_DURATION_MS = 180;

interface Props {
  show: boolean;
  children: ReactNode;
  contentClassName?: string;
}

// Context controls come and go with the active view, and mounting them
// directly makes the surrounding icons jump. Reveal measures the natural
// content width, then animates it from zero while the content slides in from
// the right. On hide it slides back out and collapses, so neighbours close the
// gap smoothly instead of snapping.
export default function Reveal({ show, children, contentClassName }: Props) {
  const [mounted, setMounted] = useState(show);
  const [revealed, setRevealed] = useState(false);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!show) {
      setRevealed(false);
      const timeout = window.setTimeout(
        () => setMounted(false),
        REVEAL_DURATION_MS,
      );
      return () => window.clearTimeout(timeout);
    }

    setMounted(true);
    // A hidden window never runs animation frames, so show the control at its
    // final size instead of leaving it collapsed until the window returns.
    if (document.visibilityState === "hidden") {
      setRevealed(true);
      return;
    }

    // The collapsed frame has to paint before the visible class is applied,
    // otherwise the browser skips the transition on a freshly inserted node.
    let innerFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [show]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const inner = innerRef.current;
    if (!inner) return;

    const measure = () => setWidth(inner.getBoundingClientRect().width);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [mounted]);

  if (!mounted) return null;

  return (
    <span
      className={`axon-reveal ${revealed ? "axon-reveal-visible" : ""}`}
      style={{ "--axon-reveal-width": `${width}px` } as CSSProperties}
      aria-hidden={!revealed}
      inert={!revealed}
    >
      <span
        ref={innerRef}
        className={`axon-reveal-inner ${contentClassName ?? ""}`}
      >
        {children}
      </span>
    </span>
  );
}
