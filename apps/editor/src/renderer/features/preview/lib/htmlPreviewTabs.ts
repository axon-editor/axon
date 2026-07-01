const HTML_PREVIEW_TAB_PREFIX = "axon-html-preview:";

export function isHtmlFile(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return extension === "html" || extension === "htm";
}

export function createHtmlPreviewTabPath(filePath: string) {
  // Preview tabs live inside the same layout arrays as normal file tabs, so the
  // value must be a stable tab identity that cannot collide with a real file
  // path. Encoding the absolute file path keeps the preview connected to the
  // source file while still letting Axon open both "index.html" and
  // "index.html preview" beside each other.
  return `${HTML_PREVIEW_TAB_PREFIX}${encodeURIComponent(filePath)}`;
}

export function isHtmlPreviewTabPath(tabPath: string) {
  return tabPath.startsWith(HTML_PREVIEW_TAB_PREFIX);
}

export function getHtmlPreviewFilePath(tabPath: string) {
  if (!isHtmlPreviewTabPath(tabPath)) return tabPath;

  try {
    return decodeURIComponent(tabPath.slice(HTML_PREVIEW_TAB_PREFIX.length));
  } catch {
    return tabPath.slice(HTML_PREVIEW_TAB_PREFIX.length);
  }
}

export function getTabFilePath(tabPath: string) {
  return isHtmlPreviewTabPath(tabPath)
    ? getHtmlPreviewFilePath(tabPath)
    : tabPath;
}

export function getTabDisplayName(tabPath: string) {
  const filePath = getTabFilePath(tabPath);
  const name = filePath.split("/").pop() ?? filePath;
  return isHtmlPreviewTabPath(tabPath) ? `${name} preview` : name;
}
