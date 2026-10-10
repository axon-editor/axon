/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type NotebookCellOutput } from "./nbformat";

function joinMultiline(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((line): line is string => typeof line === "string").join("");
  }
  return "";
}

// parseKernelOutput turns one asynchronous kernel message into a cell output, or
// null for message types this editor does not render (status, execute_input,
// comm traffic). Only the displayable subset of the Jupyter iopub channel reaches
// the notebook document, so a saved .ipynb stays close to what Jupyter itself
// would persist.
export function parseKernelOutput(
  msgType: string,
  content: unknown,
  metadata: unknown,
): NotebookCellOutput | null {
  const body = (content ?? {}) as Record<string, unknown>;
  switch (msgType) {
    case "stream":
      return {
        output_type: "stream",
        name: body.name === "stderr" ? "stderr" : "stdout",
        text: joinMultiline(body.text),
      };
    case "execute_result":
    case "display_data": {
      const data: Record<string, string> = {};
      const rawData = (body.data ?? {}) as Record<string, unknown>;
      for (const [mime, payload] of Object.entries(rawData)) {
        data[mime] = joinMultiline(payload);
      }
      return {
        output_type: msgType,
        data,
        metadata: (metadata as Record<string, unknown>) ?? {},
        execution_count:
          typeof body.execution_count === "number"
            ? body.execution_count
            : null,
      };
    }
    case "error":
      return {
        output_type: "error",
        ename: typeof body.ename === "string" ? body.ename : "Error",
        evalue: typeof body.evalue === "string" ? body.evalue : "",
        traceback: Array.isArray(body.traceback)
          ? body.traceback.filter(
              (line): line is string => typeof line === "string",
            )
          : [],
      };
    default:
      return null;
  }
}
