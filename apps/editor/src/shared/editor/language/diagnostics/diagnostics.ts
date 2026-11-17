/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface EditorDiagnostic {
  id: string;
  path: string;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  code?: string | number;
  severity: DiagnosticSeverity;
  source: string | null;
}
