const MARKDOWN_PREVIEW_TAB_PREFIX = "axon-markdown-preview:";

export function isMarkdownFile(filePath: string) {
  return /\.(md|mdx|markdown)$/i.test(filePath);
}

export function createMarkdownPreviewTabPath(filePath: string) {
  // Markdown preview tabs sit beside the source file instead of replacing it.
  // Encoding the source path gives the layout a stable virtual tab identity
  // while still letting the preview reconnect to the real Markdown document.
  return `${MARKDOWN_PREVIEW_TAB_PREFIX}${encodeURIComponent(filePath)}`;
}

export function isMarkdownPreviewTabPath(tabPath: string) {
  return tabPath.startsWith(MARKDOWN_PREVIEW_TAB_PREFIX);
}

export function getMarkdownPreviewFilePath(tabPath: string) {
  if (!isMarkdownPreviewTabPath(tabPath)) return tabPath;

  try {
    return decodeURIComponent(tabPath.slice(MARKDOWN_PREVIEW_TAB_PREFIX.length));
  } catch {
    return tabPath.slice(MARKDOWN_PREVIEW_TAB_PREFIX.length);
  }
}
