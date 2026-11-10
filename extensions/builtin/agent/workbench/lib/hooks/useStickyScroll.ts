/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// The stream grows by a few pixels per token. Calling scrollIntoView with smooth
// behavior on every token restarts the animation, makes the panel judder, and
// drags the user back down when they try to read an earlier message. A sticky
// bottom follows only while the user is already there, and it writes scrollTop
// once per frame so the panel lands exactly where the new content ends.
const BOTTOM_THRESHOLD_PX = 80;
const SCROLL_TOLERANCE_PX = 2;
const USER_INTENT_WINDOW_MS = 200;

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
  const [pinned, setPinned] = useState(true);
  const frameRef = useRef<number | null>(null);
  // The value our own scrollTop write produced. The scroll event that follows
  // is ignored only when it lands on this exact value; a real user scroll that
  // happens immediately afterwards still counts as user intent.
  const expectedScrollTopRef = useRef<number | null>(null);
  const lastUserIntentAtRef = useRef(0);

  const updatePinned = useCallback((next: boolean) => {
    if (pinnedRef.current === next) return;
    pinnedRef.current = next;
    setPinned(next);
  }, []);

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
      expectedScrollTopRef.current = element.scrollTop;
    });
  }, [cancelPendingScroll, scrollRef]);

  const pinToBottom = useCallback(() => {
    updatePinned(true);
    scheduleScrollToBottom();
  }, [scheduleScrollToBottom, updatePinned]);

  // A conversation switch replaces the whole list, so the old thread's scroll
  // position says nothing about the new one. Re-pin here so the new thread opens
  // at its latest message instead of wherever the previous thread was.
  useEffect(() => {
    updatePinned(true);
    scheduleScrollToBottom();
  }, [resetKey, scheduleScrollToBottom, updatePinned]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    let lastTouchY: number | null = null;

    const handleScroll = () => {
      // A programmatic scroll can be delivered after a wheel-up that already
      // unpinned the stream. Ignoring the scroll events in that short window
      // keeps the echo from re-pinning under the user's gesture.
      if (Date.now() - lastUserIntentAtRef.current < USER_INTENT_WINDOW_MS) {
        return;
      }

      const expected = expectedScrollTopRef.current;
      if (
        expected !== null &&
        Math.abs(element.scrollTop - expected) <= SCROLL_TOLERANCE_PX
      ) {
        // This is the echo of our own scrollTop write. Do not let it change the
        // pin state.
        expectedScrollTopRef.current = null;
        return;
      }
      expectedScrollTopRef.current = null;

      const distance =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      updatePinned(distance <= BOTTOM_THRESHOLD_PX);
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0) return;
      // A real upward gesture wins immediately, even if the content grew in the
      // same frame and the distance still looks close to the bottom.
      lastUserIntentAtRef.current = Date.now();
      expectedScrollTopRef.current = null;
      updatePinned(false);
      cancelPendingScroll();
    };

    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY;
      if (lastTouchY !== null && nextY !== undefined && nextY > lastTouchY) {
        lastUserIntentAtRef.current = Date.now();
        expectedScrollTopRef.current = null;
        updatePinned(false);
        cancelPendingScroll();
      }
      lastTouchY = nextY ?? null;
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    element.addEventListener("wheel", handleWheel, { passive: true });
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
    };
  }, [
    cancelPendingScroll,
    resetKey,
    scrollRef,
    updatePinned,
  ]);

  useEffect(() => {
    if (!pinnedRef.current) return;
    scheduleScrollToBottom();
  }, [contentVersion, scheduleScrollToBottom]);

  useEffect(() => {
    return () => {
      cancelPendingScroll();
    };
  }, [cancelPendingScroll]);

  return { pinToBottom, pinned };
}
