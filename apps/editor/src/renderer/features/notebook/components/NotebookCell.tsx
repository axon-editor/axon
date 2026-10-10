/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Editor from "@monaco-editor/react";
import { Play, Plus, Trash } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type EditorSettings } from "@axon-editor/shared/core/settings";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions/extensions";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/theme/themeTokens";
import {
  getMonacoThemeId,
  registerAxonTheme,
} from "@axon-editor/renderer/shared/lib/theme/soraTheme";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import { type NotebookCell } from "../lib/nbformat";
import { type CellRuntime } from "../session/useKernelSession";
import CellOutputView from "./outputs/CellOutputView";

interface Props {
  cell: NotebookCell;
  runtime: CellRuntime | undefined;
  editorSettings: EditorSettings;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  kernelBusy: boolean;
  onSourceChange: (cellId: string, source: string) => void;
  onRun: (cellId: string) => void;
  onDelete: (cellId: string) => void;
  onInsertBelow: (cellId: string) => void;
}

function editorOptions(editorSettings: EditorSettings) {
  return {
    automaticLayout: true,
    contextmenu: false,
    fontFamily: editorSettings.fontFamily,
    fontSize: editorSettings.fontSize,
    lineHeight: editorSettings.lineHeight,
    lineNumbers: "off" as const,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    renderLineHighlight: "none" as const,
    scrollBeyondLastLine: false,
    scrollbar: { vertical: "auto" as const, horizontal: "hidden" as const },
    wordWrap: "on" as const,
    padding: { top: 8, bottom: 8 },
  };
}

export default function NotebookCell({
  cell,
  runtime,
  editorSettings,
  themeSyntax,
  themeTokens,
  kernelBusy,
  onSourceChange,
  onRun,
  onDelete,
  onInsertBelow,
}: Props) {
  const [editingMarkdown, setEditingMarkdown] = useState(
    cell.cell_type === "markdown" && cell.source.trim().length === 0,
  );
  const options = editorOptions(editorSettings);
  const language = cell.cell_type === "markdown" ? "markdown" : "python";

  const outputs = runtime?.outputs.length
    ? runtime.outputs
    : (cell.outputs ?? []);
  const running = runtime?.status === "running";
  const executionCount =
    runtime?.executionCount ?? cell.execution_count ?? null;

  return (
    <div
      className="group relative flex gap-2 border-b border-[var(--axon-panel-border)] px-2 py-1"
      data-cell-id={cell.id}
    >
      <div className="flex w-12 shrink-0 flex-col items-end gap-1 pt-2 pr-1">
        {cell.cell_type === "code" && (
          <>
            <Tooltip label={running ? "Running" : "Run cell"} side="right">
              <button
                type="button"
                onClick={() => onRun(cell.id)}
                disabled={running || kernelBusy}
                aria-label="Run cell"
                className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-default disabled:opacity-20"
              >
                <Play size={13} />
              </button>
            </Tooltip>
            <span className="font-mono text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
              {executionCount === null || running
                ? running
                  ? "[*]"
                  : "[ ]"
                : `[${executionCount}]`}
            </span>
          </>
        )}
        {cell.cell_type === "markdown" && editingMarkdown && (
          <button
            type="button"
            onClick={() => setEditingMarkdown(false)}
            aria-label="Render markdown"
            className="cursor-pointer rounded px-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:opacity-100"
          >
            OK
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {cell.cell_type === "markdown" && !editingMarkdown ? (
          <div
            className="axon-notebook-markdown cursor-text px-1 py-2 text-[13px] leading-[1.6] text-[var(--axon-editor-foreground)]"
            onDoubleClick={() => setEditingMarkdown(true)}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cell.source}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-transparent focus-within:border-[var(--axon-focus-border,var(--axon-panel-border))]">
            <Editor
              height={`${Math.max(1, cell.source.split("\n").length) * (editorSettings.lineHeight || 20) + 4}px`}
              language={language}
              theme={getMonacoThemeId(editorSettings.themeId)}
              value={cell.source}
              options={options}
              beforeMount={(monacoInstance) =>
                registerAxonTheme(
                  monacoInstance,
                  editorSettings.themeId,
                  themeTokens,
                  [],
                  themeSyntax,
                )
              }
              onChange={(value) => onSourceChange(cell.id, value ?? "")}
            />
          </div>
        )}

        {outputs.length > 0 && (
          <div className="mt-1 overflow-hidden rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background,transparent)]">
            {outputs.map((output, index) => (
              <CellOutputView key={index} output={output} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
        <Tooltip label="Delete cell" side="left">
          <button
            type="button"
            onClick={() => onDelete(cell.id)}
            aria-label="Delete cell"
            className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <Trash size={13} />
          </button>
        </Tooltip>
        <Tooltip label="Insert cell below" side="left">
          <button
            type="button"
            onClick={() => onInsertBelow(cell.id)}
            aria-label="Insert cell below"
            className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <Plus size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}


