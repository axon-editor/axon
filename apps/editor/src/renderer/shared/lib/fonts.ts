export function fontStack(primaryFont: string, fallback: string) {
  if (primaryFont === ".ZedSans") {
    return `"IBM Plex Sans Variable", ${fallback}`;
  }
  if (primaryFont === ".ZedMono") {
    return `"Lilex", "IBM Plex Mono", "Axon Mono", ${fallback}`;
  }
  if (primaryFont === ".AxonSans") {
    return `"Inter Variable", ${fallback}`;
  }
  if (primaryFont === ".AxonMono") {
    return `"Axon Mono", "Lilex", "IBM Plex Mono", ${fallback}`;
  }

  // Fontsource registers variable fonts under explicit `Variable` family
  // names, while Settings keeps the familiar product names users expect. Put
  // the bundled face first and the same-named system font second so every
  // platform gets working typography without breaking an existing local font
  // installation if the bundled asset ever fails to load.
  if (primaryFont === "Fira Code") {
    return `"Fira Code Variable", "Fira Code", ${fallback}`;
  }
  if (primaryFont === "JetBrains Mono") {
    return `"JetBrains Mono Variable", "JetBrains Mono", ${fallback}`;
  }

  return `"${primaryFont}", ${fallback}`;
}

export function editorFontStack(primaryFont: string) {
  return fontStack(primaryFont, "monospace");
}
