export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface EditorDiagnostic {
  id: string;
  path: string;
  message: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  source: string | null;
}
