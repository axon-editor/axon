/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, type RefObject } from "react";

// The stream grows by a few pixels per token. Calling scrollIntoView with smooth
// behavior on every token restarts the animation, makes the panel judder, and
// drags the user back down when they try to read an earlier message. A sticky
// bottom follows only while the user is already there, and it writes scrollTop
// once per frame so the panel lands exactly where the new content ends.
const BOTTOM_THRESHOLD_PX = 24;

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentVersion: unknown;
  resetKey?: string | null;
}

export function useStickyScroll({
  scrollRef,
  contentVersion,
  resetKey,
}: Options) {
  const pinnedRef = useRef(true);
  const frameRef = useRef<number | null>(null);

  const cancelPendingScroll = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const scheduleScrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    cancelPendingScroll();
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      // The user can scroll up between the update and the next frame. Their
      // position wins over the pending follow, otherwise the stream steals the
      // scroll back for a single frame.
      if (!pinnedRef.current) return;
      element.scrollTop = element.scrollHeight;
    });
  }, [cancelPendingScroll, scrollRef]);

  const pinToBottom = useCallback(() => {
    pinnedRef.current = true;
    scheduleScrollToBottom();
  }, [scheduleScrollToBottom]);

  // A conversation switch replaces the whole list, so the old thread's scroll
  // position says nothing about the new one. Re-pin here so the new thread opens
  // at its latest message instead of wherever the previous thread was.
  useEffect(() => {
    pinnedRef.current = true;
    scheduleScrollToBottom();
  }, [resetKey, scheduleScrollToBottom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      const distance =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      // Programmatic scrolls also fire this event and land within the
      // threshold, which keeps the stream pinned. Only a real upward scroll
      // pushes the distance past it and unpins.
      pinnedRef.current = distance <= BOTTOM_THRESHOLD_PX;
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [resetKey, scrollRef]);

  useEffect(() => {
    if (!pinnedRef.current) return;
    scheduleScrollToBottom();
  }, [contentVersion, scheduleScrollToBottom]);

  useEffect(() => cancelPendingScroll, [cancelPendingScroll]);

  return { pinToBottom };
}
