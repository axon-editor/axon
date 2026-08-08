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
