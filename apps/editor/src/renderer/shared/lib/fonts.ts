export function fontStack(primaryFont: string, fallback: string) {
  if (primaryFont === ".ZedSans") {
    return `"IBM Plex Sans", "Axon Sans", ${fallback}`;
  }
  if (primaryFont === ".ZedMono") {
    return `"Lilex", "IBM Plex Mono", "Axon Mono", ${fallback}`;
  }
  if (primaryFont === ".AxonSans") {
    return `"Axon Sans", "IBM Plex Sans", ${fallback}`;
  }
  if (primaryFont === ".AxonMono") {
    return `"Axon Mono", "Lilex", "IBM Plex Mono", ${fallback}`;
  }

  return `"${primaryFont}", ${fallback}`;
}

export function editorFontStack(primaryFont: string) {
  return fontStack(primaryFont, "monospace");
}

