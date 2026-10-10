/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Jupyter notebook (nbformat v4) document model. Axon reads and writes the same
// on-disk format as Jupyter and JupyterLab so a notebook can move between the two
// without a conversion step. Only the fields this editor round-trips are modelled;
// unknown metadata keys on the document and on individual cells are preserved
// verbatim through the `raw` escape hatches so opening a notebook in Axon never
// silently drops another tool's fields.

export type NotebookCellType = "code" | "markdown" | "raw";

export interface NotebookStreamOutput {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: string;
}

export interface NotebookRichOutput {
  output_type: "execute_result" | "display_data";
  data: Record<string, string>;
  metadata: Record<string, unknown>;
  execution_count?: number | null;
}

export interface NotebookErrorOutput {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}

export type NotebookCellOutput =
  | NotebookStreamOutput
  | NotebookRichOutput
  | NotebookErrorOutput;

export interface NotebookCell {
  id: string;
  cell_type: NotebookCellType;
  source: string;
  metadata: Record<string, unknown>;
  // Code cells only.
  execution_count?: number | null;
  outputs?: NotebookCellOutput[];
}

export interface NotebookDocument {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

// Jupyter stores multi-line text as either a single string or an array of lines
// whose entries already include their trailing newline. Axon works with plain
// strings everywhere and joins arrays here so the rest of the editor never has to
// branch on which representation a file happened to use.
function joinMultiline(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((line): line is string => typeof line === "string").join("");
  }
  return "";
}

function splitMultiline(value: string): string[] {
  return value.split("\n").map((line, index, lines) =>
    index < lines.length - 1 ? `${line}\n` : line,
  );
}

function randomCellId() {
  const raw = new Uint8Array(8);
  crypto.getRandomValues(raw);
  return Array.from(raw, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeOutput(raw: unknown): NotebookCellOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const output = raw as Record<string, unknown>;
  switch (output.output_type) {
    case "stream":
      return {
        output_type: "stream",
        name: output.name === "stderr" ? "stderr" : "stdout",
        text: joinMultiline(output.text),
      };
    case "execute_result":
    case "display_data": {
      const data: Record<string, string> = {};
      const rawData = (output.data ?? {}) as Record<string, unknown>;
      for (const [mime, payload] of Object.entries(rawData)) {
        data[mime] = joinMultiline(payload);
      }
      return {
        output_type: output.output_type,
        data,
        metadata: (output.metadata as Record<string, unknown>) ?? {},
        execution_count:
          typeof output.execution_count === "number"
            ? output.execution_count
            : null,
      };
    }
    case "error":
      return {
        output_type: "error",
        ename: typeof output.ename === "string" ? output.ename : "Error",
        evalue: typeof output.evalue === "string" ? output.evalue : "",
        traceback: Array.isArray(output.traceback)
          ? output.traceback.filter(
              (line): line is string => typeof line === "string",
            )
          : [],
      };
    default:
      return null;
  }
}

function normalizeCell(raw: unknown, index: number): NotebookCell | null {
  if (!raw || typeof raw !== "object") return null;
  const cell = raw as Record<string, unknown>;
  const cellType = cell.cell_type;
  if (cellType !== "code" && cellType !== "markdown" && cellType !== "raw") {
    return null;
  }
  const normalized: NotebookCell = {
    id:
      typeof cell.id === "string" && cell.id
        ? cell.id
        : `cell-${index}-${randomCellId()}`,
    cell_type: cellType,
    source: joinMultiline(cell.source),
    metadata: (cell.metadata as Record<string, unknown>) ?? {},
  };
  if (cellType === "code") {
    normalized.execution_count =
      typeof cell.execution_count === "number" ? cell.execution_count : null;
    normalized.outputs = Array.isArray(cell.outputs)
      ? cell.outputs
          .map(normalizeOutput)
          .filter((output): output is NotebookCellOutput => output !== null)
      : [];
  }
  return normalized;
}

export function parseNotebook(text: string): NotebookDocument {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed.nbformat !== 4) {
    throw new Error(
      "Axon can only open Jupyter notebooks in nbformat 4 (the format used by JupyterLab and modern Jupyter).",
    );
  }
  const cells = Array.isArray(parsed.cells)
    ? parsed.cells
        .map(normalizeCell)
        .filter((cell): cell is NotebookCell => cell !== null)
    : [];
  return {
    cells,
    metadata: (parsed.metadata as Record<string, unknown>) ?? {},
    nbformat: 4,
    nbformat_minor:
      typeof parsed.nbformat_minor === "number" ? parsed.nbformat_minor : 5,
  };
}

function serializeOutput(output: NotebookCellOutput): Record<string, unknown> {
  switch (output.output_type) {
    case "stream":
      return {
        output_type: "stream",
        name: output.name,
        text: splitMultiline(output.text),
      };
    case "execute_result":
    case "display_data": {
      const data: Record<string, string[]> = {};
      const preferredOrder = [
        "text/plain",
        "text/html",
        "image/png",
        "image/jpeg",
        "image/svg+xml",
        "application/json",
      ];
      // Preferred MIME keys are written first so a notebook diff stays stable,
      // then any remaining payloads are preserved so round-tripping never drops
      // another kernel's rich representation (text/latex, application/vnd...).
      const orderedMimes = [
        ...preferredOrder.filter((mime) => mime in output.data),
        ...Object.keys(output.data).filter(
          (mime) => !preferredOrder.includes(mime),
        ),
      ];
      for (const mime of orderedMimes) {
        data[mime] = splitMultiline(output.data[mime]);
      }
      return {
        output_type: output.output_type,
        data,
        metadata: output.metadata,
        ...(output.output_type === "execute_result"
          ? { execution_count: output.execution_count ?? null }
          : {}),
      };
    }
    case "error":
      return {
        output_type: "error",
        ename: output.ename,
        evalue: output.evalue,
        traceback: output.traceback,
      };
  }
}

function serializeCell(cell: NotebookCell): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    cell_type: cell.cell_type,
    id: cell.id,
    metadata: cell.metadata,
    source: splitMultiline(cell.source),
  };
  if (cell.cell_type === "code") {
    serialized.execution_count = cell.execution_count ?? null;
    serialized.outputs = (cell.outputs ?? []).map(serializeOutput);
  }
  return serialized;
}

export function serializeNotebook(document: NotebookDocument): string {
  const serialized = {
    cells: document.cells.map(serializeCell),
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
      language_info: { name: "python" },
      ...document.metadata,
    },
    nbformat: 4,
    nbformat_minor: Math.max(5, document.nbformat_minor),
  };
  return `${JSON.stringify(serialized, null, 1)}\n`;
}

export function createEmptyNotebook(): NotebookDocument {
  return {
    cells: [createCell("code")],
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export function createCell(cellType: NotebookCellType): NotebookCell {
  const cell: NotebookCell = {
    id: `cell-${randomCellId()}`,
    cell_type: cellType,
    source: "",
    metadata: {},
  };
  if (cellType === "code") {
    cell.execution_count = null;
    cell.outputs = [];
  }
  return cell;
}
