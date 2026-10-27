/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import AssistantMarkdown from "./AssistantMarkdown";

const REVEAL_CHARS_PER_FRAME = 4;
const REVEAL_CATCH_UP_FRAMES = 120;

interface Props {
  content: string;
  animateOnMount?: boolean;
}

// A large final answer arrives as one delta when the agent reuses its planning
// turn. Revealing a fixed number of characters per frame would make a long
// answer take too long, so the step grows with the backlog and the whole reveal
// still finishes in roughly two seconds.
function revealStep(remaining: number) {
  return Math.max(
    REVEAL_CHARS_PER_FRAME,
    Math.ceil(remaining / REVEAL_CATCH_UP_FRAMES),
  );
}

export default function SmoothText({ content, animateOnMount = false }: Props) {
  const [visible, setVisible] = useState(() =>
    animateOnMount ? "" : content,
  );
  const visibleRef = useRef(visible);
  const targetRef = useRef(content);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = content;

    // A replaced target, such as edit-proposal JSON being stripped at the end
    // of a stream, should snap instead of typing backwards through text that
    // is no longer part of the answer.
    if (!content.startsWith(visibleRef.current)) {
      visibleRef.current = content;
      setVisible(content);
      return;
    }

    if (
      visibleRef.current.length >= content.length ||
      frameRef.current !== null
    ) {
      return;
    }

    const tick = () => {
      const target = targetRef.current;
      const current = visibleRef.current;
      if (current.length >= target.length) {
        frameRef.current = null;
        return;
      }

      const nextLength = Math.min(
        target.length,
        current.length + revealStep(target.length - current.length),
      );
      const next = target.slice(0, nextLength);
      visibleRef.current = next;
      setVisible(next);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [content]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return <AssistantMarkdown content={visible} />;
}
