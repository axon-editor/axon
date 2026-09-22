/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bidirectional scroll sync between editor and preview. Uses a pub/sub
// system to decouple the editor and preview components.
//
// The sync works by:
// 1. Editor scrolls -> publish scroll event with line number
// 2. Preview receives event -> find nearest data-source-line element
// 3. Preview scrolls to that element
// 4. Preview publishes its own scroll event (suppressed for one frame)
// 5. Editor receives preview scroll -> updates cursor position
//
// The suppression mechanism prevents feedback loops where each pane
// continuously triggers the other to scroll.

export interface MarkdownScrollEvent {
  filePath: string;
  line: number;
  source: "editor" | "preview";
}

type ScrollListener = (event: MarkdownScrollEvent) => void;

const listeners = new Set<ScrollListener>();

// Publishes a scroll event to all subscribers. Called by both the
// editor and preview when the user scrolls.
export function publishMarkdownScroll(event: MarkdownScrollEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

// Subscribes to scroll events. Returns an unsubscribe function.
export function onMarkdownScroll(listener: ScrollListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Finds the nearest element with a data-source-line attribute that is
// at or before the given line number. Used by the preview to scroll
// to the element corresponding to the editor's cursor position.
export function findNearestSourceLine(
  container: HTMLElement,
  line: number,
): HTMLElement | null {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-line]"),
  );

  let closest: HTMLElement | null = null;

  for (const el of elements) {
    const elLine = Number(el.getAttribute("data-source-line"));
    if (!Number.isFinite(elLine) || elLine > line) continue;

    if (!closest) {
      closest = el;
    } else {
      const closestLine = Number(closest.getAttribute("data-source-line"));
      if (elLine > closestLine) {
        closest = el;
      }
    }
  }

  return closest;
}

// Finds the line number of the first visible element in the preview.
// Used by the preview to report its scroll position back to the editor.
export function findVisibleSourceLine(container: HTMLElement): number | null {
  const viewportTop = container.getBoundingClientRect().top + 20;

  const elements = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-line]"),
  );

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom >= viewportTop) {
      const line = Number(el.getAttribute("data-source-line"));
      if (Number.isFinite(line)) return line;
    }
  }

  return null;
}
