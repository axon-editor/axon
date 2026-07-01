export type FileSymbolKind =
  | "function"
  | "class"
  | "enum"
  | "interface"
  | "namespace"
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
  { kind: "class", pattern: /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "interface", pattern: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "enum", pattern: /^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "namespace", pattern: /^\s*(?:export\s+)?(?:namespace|module)\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "type", pattern: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:memo|forwardRef|observer)\s*\(/, nameIndex: 1 },
  { kind: "variable", pattern: /^\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*[{[]/, nameIndex: 1 },
  { kind: "method", pattern: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?:[{:]|=>)?/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, nameIndex: 1 },
  { kind: "struct", pattern: /^\s*type\s+([A-Za-z_]\w*)\s+struct\b/, nameIndex: 1 },
  { kind: "interface", pattern: /^\s*type\s+([A-Za-z_]\w*)\s+interface\b/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*def\s+([A-Za-z_]\w*)\s*\(/, nameIndex: 1 },
  { kind: "class", pattern: /^\s*class\s+([A-Za-z_]\w*)\s*[:(]/, nameIndex: 1 },
  { kind: "function", pattern: /^\s*fn\s+([A-Za-z_]\w*)\s*\(/, nameIndex: 1 },
  { kind: "struct", pattern: /^\s*struct\s+([A-Za-z_]\w*)\b/, nameIndex: 1 },
  { kind: "enum", pattern: /^\s*enum\s+([A-Za-z_]\w*)\b/, nameIndex: 1 },
  { kind: "method", pattern: /^\s*impl(?:\s+[\w:<>,\s]+)?\s+for\s+([A-Za-z_]\w*)\b/, nameIndex: 1 },
  { kind: "method", pattern: /^\s*impl\s+([A-Za-z_]\w*)\b/, nameIndex: 1 },
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
    trimmed.startsWith("else ") ||
    trimmed.startsWith("case ") ||
    trimmed.startsWith("default:") ||
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
