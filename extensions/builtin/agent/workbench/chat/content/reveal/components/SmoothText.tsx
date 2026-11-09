/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memo, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../../../lib/motion/prefersReducedMotion";
import AssistantMarkdown from "../../markdown/components/AssistantMarkdown";
import { REVEAL_INTERVAL_MS, revealStep } from "../model/revealStep";

interface Props {
  content: string;
  animateOnMount?: boolean;
  onOpenLink?: (href: string) => void;
}

function SmoothText({ content, animateOnMount = false, onOpenLink }: Props) {
  const [visible, setVisible] = useState(() =>
    animateOnMount && !prefersReducedMotion() ? "" : content,
  );
  const visibleRef = useRef(visible);
  const targetRef = useRef(content);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = content;

    // A replaced target, such as edit-proposal JSON being stripped at the end
    // of a stream, should snap instead of typing backwards through text that
    // is no longer part of the answer. Reduced-motion users get the same snap
    // for every update.
    if (!content.startsWith(visibleRef.current) || prefersReducedMotion()) {
      if (visibleRef.current !== content) {
        visibleRef.current = content;
        setVisible(content);
      }
      return;
    }

    if (
      visibleRef.current.length >= content.length ||
      timerRef.current !== null
    ) {
      return;
    }

    const tick = () => {
      const target = targetRef.current;
      const current = visibleRef.current;
      if (current.length >= target.length) {
        timerRef.current = null;
        return;
      }

      const nextLength = Math.min(
        target.length,
        current.length + revealStep(target.length - current.length),
      );
      const next = target.slice(0, nextLength);
      if (next === current) {
        timerRef.current = null;
        return;
      }

      visibleRef.current = next;
      setVisible(next);
      timerRef.current = window.setTimeout(tick, REVEAL_INTERVAL_MS);
    };

    timerRef.current = window.setTimeout(tick, REVEAL_INTERVAL_MS);
  }, [content]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return <AssistantMarkdown content={visible} onOpenLink={onOpenLink} />;
}

export default memo(SmoothText);
