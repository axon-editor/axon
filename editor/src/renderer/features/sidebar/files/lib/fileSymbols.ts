export type FileSymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "method"
  | "struct"
  | "variable";

export interface FileSymbol {
  id: string;
  name: string;
  kind: FileSymbolKind;
  line: number;
  column: number;
  preview: string;
}

const symbolPatterns: Array<{
  kind: FileSymbolKind;
  pattern: RegExp;
  nameIndex: number;
}> = [
  { kind: "class", pattern: /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "interface", pattern: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "type", pattern: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/, nameIndex: 1 },
  { kind: "method", pattern: /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[{:]?/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, nameIndex: 1 },
  { kind: "struct", pattern: /^\s*type\s+([A-Za-z_]\w*)\s+struct\b/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*def\s+([A-Za-z_]\w*)\s*\(/, nameIndex: 1 },
  { kind: "class", pattern: /^\s*class\s+([A-Za-z_]\w*)\s*[:(]/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*fn\s+([A-Za-z_]\w*)\s*\(/, nameIndex: 1 },
];

// This parser is deliberately lightweight. It gives Axon an always-available
// outline for common project files before the heavier LSP navigation layer is
// complete, and it reads the live Monaco buffer instead of disk so unsaved code
// still appears in the outline.
function shouldSkipMethodMatch(line: string) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("if ") ||
    trimmed.startsWith("for ") ||
    trimmed.startsWith("while ") ||
    trimmed.startsWith("switch ") ||
    trimmed.startsWith("catch ") ||
    trimmed.startsWith("return ")
  );
}

export function collectFileSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    for (const symbolPattern of symbolPatterns) {
      const match = symbolPattern.pattern.exec(line);
      if (!match) continue;
      if (symbolPattern.kind === "method" && shouldSkipMethodMatch(line)) {
        continue;
      }

      const name = match[symbolPattern.nameIndex];
      const column = Math.max(1, line.indexOf(name) + 1);
      symbols.push({
        id: `${index + 1}:${column}:${name}`,
        name,
        kind: symbolPattern.kind,
        line: index + 1,
        column,
        preview: line.trim(),
      });
      break;
    }
  });

  return symbols;
}
