import * as monaco from "monaco-editor";

export interface CodeSnapshotPalette {
  background: string;
  border: string;
  foreground: string;
  header: string;
  lineNumber: string;
}

export interface CodeSnapshotRenderOptions {
  code: string;
  fileName: string;
  fontFamily: string;
  fontSize: number;
  languageId: string;
  padding: number;
  palette: CodeSnapshotPalette;
  showFileName: boolean;
  showLineNumbers: boolean;
  startLine: number;
  tabSize: number;
  width: number;
}

interface TokenStyle {
  color: string;
  fontStyle: string;
  fontWeight: string;
}

const EXPORT_SCALE = 2;
const MAX_EXPORT_HEIGHT = 16_000;

function roundedRect(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(0.5, 0.5, width - 1, height - 1, radius);
}

function parseRgb(color: string) {
  const hex = color.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? channels : null;
}

function luminance(color: string) {
  const channels = parseRgb(color);
  if (!channels) return null;
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function hasReadableContrast(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return true;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05) >= 2.4;
}

function readTokenStyle(
  tokenClass: string,
  fallback: string,
  background: string,
): TokenStyle {
  if (!tokenClass) {
    return { color: fallback, fontStyle: "normal", fontWeight: "400" };
  }

  const editorRoot = document.createElement("span");
  const token = document.createElement("span");
  editorRoot.className = "monaco-editor";
  editorRoot.style.cssText =
    "position:fixed;left:-10000px;top:-10000px;visibility:hidden";
  token.className = tokenClass;
  token.textContent = "M";
  editorRoot.appendChild(token);
  document.body.appendChild(editorRoot);
  const computed = getComputedStyle(token);
  const computedColor = computed.color || fallback;
  const style = {
    color: hasReadableContrast(computedColor, background)
      ? computedColor
      : fallback,
    fontStyle: computed.fontStyle || "normal",
    fontWeight: computed.fontWeight || "400",
  };
  editorRoot.remove();
  return style;
}

function expandTabs(value: string, startColumn: number, tabSize: number) {
  let column = startColumn;
  let expanded = "";

  for (const character of value) {
    if (character !== "\t") {
      expanded += character;
      column += 1;
      continue;
    }

    const spaces = tabSize - (column % tabSize);
    expanded += " ".repeat(spaces);
    column += spaces;
  }

  return { expanded, endColumn: column };
}

function tokenize(code: string, languageId: string) {
  try {
    return monaco.editor.tokenize(code, languageId);
  } catch {
    return code.split("\n").map(() => []);
  }
}

export function renderCodeSnapshot(
  canvas: HTMLCanvasElement,
  options: CodeSnapshotRenderOptions,
) {
  const lines = options.code.split("\n");
  const lineHeight = Math.round(options.fontSize * 1.55);
  const headerHeight = options.showFileName ? 52 : 0;
  const contentHeight =
    headerHeight + options.padding * 2 + Math.max(1, lines.length) * lineHeight;
  const height = Math.min(MAX_EXPORT_HEIGHT / EXPORT_SCALE, contentHeight);
  const width = options.width;

  canvas.width = width * EXPORT_SCALE;
  canvas.height = Math.ceil(height * EXPORT_SCALE);
  canvas.style.width = `${width}px`;
  canvas.style.height = "auto";

  const context = canvas.getContext("2d");
  if (!context) return;
  context.resetTransform();
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  context.imageSmoothingEnabled = true;

  roundedRect(context, width, height, 18);
  context.fillStyle = options.palette.background;
  context.fill();
  context.save();
  context.clip();

  if (options.showFileName) {
    context.fillStyle = options.palette.header;
    context.fillRect(0, 0, width, headerHeight);
    context.fillStyle = "#ff6b6b";
    context.beginPath();
    context.arc(22, 26, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffd166";
    context.beginPath();
    context.arc(40, 26, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#5eead4";
    context.beginPath();
    context.arc(58, 26, 5, 0, Math.PI * 2);
    context.fill();
    context.font = `600 13px ${options.fontFamily}`;
    context.fillStyle = options.palette.foreground;
    context.textBaseline = "middle";
    context.fillText(options.fileName, 82, 26, width - 108);
  }

  const lastLineNumber = options.startLine + lines.length - 1;
  const numberDigits = String(Math.max(1, lastLineNumber)).length;
  const lineNumberWidth = options.showLineNumbers
    ? Math.max(38, numberDigits * options.fontSize * 0.68 + 18)
    : 0;
  const codeX = options.padding + lineNumberWidth;
  const firstBaseline = headerHeight + options.padding + options.fontSize;
  const tokenLines = tokenize(options.code, options.languageId);
  const tokenStyles = new Map<string, TokenStyle>();

  context.textBaseline = "alphabetic";
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const baseline = firstBaseline + lineIndex * lineHeight;
    if (baseline > height - options.padding + options.fontSize) break;

    if (options.showLineNumbers) {
      context.font = `400 ${options.fontSize}px ${options.fontFamily}`;
      context.fillStyle = options.palette.lineNumber;
      context.textAlign = "right";
      context.fillText(
        String(options.startLine + lineIndex),
        options.padding + lineNumberWidth - 18,
        baseline,
      );
    }

    context.textAlign = "left";
    const line = lines[lineIndex] ?? "";
    const tokens = tokenLines[lineIndex] ?? [];
    if (tokens.length === 0) {
      context.font = `400 ${options.fontSize}px ${options.fontFamily}`;
      context.fillStyle = options.palette.foreground;
      context.fillText(
        expandTabs(line, 0, options.tabSize).expanded,
        codeX,
        baseline,
      );
      continue;
    }

    let x = codeX;
    let column = 0;
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      const nextOffset = tokens[tokenIndex + 1]?.offset ?? line.length;
      const value = line.slice(token.offset, nextOffset);
      const expanded = expandTabs(value, column, options.tabSize);
      column = expanded.endColumn;
      const tokenClass = token.type;
      let style = tokenStyles.get(tokenClass);
      if (!style) {
        style = readTokenStyle(
          tokenClass,
          options.palette.foreground,
          options.palette.background,
        );
        tokenStyles.set(tokenClass, style);
      }
      context.font = `${style.fontStyle} ${style.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
      context.fillStyle = style.color;
      context.fillText(expanded.expanded, x, baseline);
      x += context.measureText(expanded.expanded).width;
    }
  }

  context.restore();
  roundedRect(context, width, height, 18);
  context.strokeStyle = options.palette.border;
  context.lineWidth = 1;
  context.stroke();
}
