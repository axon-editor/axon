export const LARGE_DOCUMENT_CHARACTER_THRESHOLD = 2 * 1024 * 1024;
export const LARGE_DOCUMENT_LINE_THRESHOLD = 20_000;
export const LARGE_DOCUMENT_FIND_MATCH_LIMIT = 5_000;

interface MeasurableTextModel {
  getLineCount(): number;
  getValueLength(): number;
}

export function isLargeDocumentContent(content: string) {
  if (content.length >= LARGE_DOCUMENT_CHARACTER_THRESHOLD) return true;

  // A generated file can contain hundreds of thousands of very short lines
  // without crossing the character threshold. I stop counting as soon as the
  // policy threshold is reached, so detection itself never performs the full
  // split and allocation that large-file mode exists to avoid.
  let lineCount = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 10) continue;
    lineCount += 1;
    if (lineCount >= LARGE_DOCUMENT_LINE_THRESHOLD) return true;
  }
  return false;
}

export function isLargeDocumentModel(model: MeasurableTextModel) {
  return (
    model.getValueLength() >= LARGE_DOCUMENT_CHARACTER_THRESHOLD ||
    model.getLineCount() >= LARGE_DOCUMENT_LINE_THRESHOLD
  );
}
