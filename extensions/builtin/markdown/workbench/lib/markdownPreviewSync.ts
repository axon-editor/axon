/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface MarkdownScrollEvent {
  filePath: string;
  line: number;
  source: "editor" | "preview";
}

const listeners = new Set<(event: MarkdownScrollEvent) => void>();

export function publishMarkdownScroll(event: MarkdownScrollEvent) {
  listeners.forEach((listener) => listener(event));
}

export function onMarkdownScroll(
  listener: (event: MarkdownScrollEvent) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
