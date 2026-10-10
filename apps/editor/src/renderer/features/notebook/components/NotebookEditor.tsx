/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type EditorSettings } from "@axon-editor/shared/core/settings";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions/extensions";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/theme/themeTokens";
import {
  readFile,
  writeFile,
} from "@axon-editor/renderer/shared/lib/backend/api";
import {
  AXON_EDITOR_SAVE_EVENT,
  type EditorSaveEventDetail,
} from "../../editor/lib/buffer/persistence/editorSave";
import {
  createCell,
  parseNotebook,
  serializeNotebook,
  type NotebookCell,
  type NotebookCellType,
  type NotebookDocument,
} from "../lib/nbformat";
import { mergeRuntimeIntoDocument } from "../lib/mergeRuntime";
import { useKernelSession } from "../session/useKernelSession";
import NotebookToolbar from "./NotebookToolbar";
import NotebookCellView from "./NotebookCell";

interface Props {
  filePath: string;
  folderPath: string | null;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
  editorSettings: EditorSettings;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
}

export default function NotebookEditor({
  filePath,
  folderPath,
  visible,
  onDirtyChange,
  editorSettings,
  themeSyntax,
  themeTokens,
}: Props) {
  const [document, setDocument] = useState<NotebookDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const documentRef = useRef<NotebookDocument | null>(null);
  const baselineRef = useRef("");
  const lastDirtyRef = useRef<boolean | null>(null);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  const session = useKernelSession(filePath, visible && Boolean(document));
  const { cellRuntime } = session;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    readFile(filePath, folderPath ?? undefined)
      .then((file) => {
        if (cancelled) return;
        const parsed = parseNotebook(file.content);
        baselineRef.current = serializeNotebook(parsed);
        documentRef.current = parsed;
        lastDirtyRef.current = false;
        onDirtyChange(filePath, false);
        setDocument(parsed);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "The notebook could not be opened.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, folderPath, onDirtyChange]);

  const mergedDocument = useMemo(
    () => (document ? mergeRuntimeIntoDocument(document, cellRuntime) : null),
    [document, cellRuntime],
  );

  // Dirty state is derived from the serialized document, which includes the
  // outputs merged from the live kernel session. This mirrors Jupyter: running a
  // cell updates the persisted output and marks the notebook unsaved.
  useEffect(() => {
    if (!mergedDocument) return;
    const dirty = serializeNotebook(mergedDocument) !== baselineRef.current;
    if (dirty !== lastDirtyRef.current) {
      lastDirtyRef.current = dirty;
      onDirtyChange(filePath, dirty);
    }
  }, [mergedDocument, filePath, onDirtyChange]);

  const handleSave = useCallback(async () => {
    const current = documentRef.current;
    if (!current) return;
    if (!folderPath) {
      setError("Save the notebook inside a workspace folder to save changes.");
      return;
    }
    setSaving(true);
    try {
      const merged = mergeRuntimeIntoDocument(current, cellRuntime);
      const serialized = serializeNotebook(merged);
      await writeFile(filePath, serialized, folderPath);
      baselineRef.current = serialized;
      lastDirtyRef.current = false;
      onDirtyChange(filePath, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The notebook could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [cellRuntime, filePath, folderPath, onDirtyChange]);

  useEffect(() => {
    const handleMenuSave = (event: Event) => {
      const saveEvent = event as CustomEvent<EditorSaveEventDetail>;
      if (saveEvent.detail?.path !== filePath) return;
      if (!visible || saveEvent.defaultPrevented) return;
      saveEvent.preventDefault();
      void handleSave();
    };
    window.addEventListener(AXON_EDITOR_SAVE_EVENT, handleMenuSave);
    return () =>
      window.removeEventListener(AXON_EDITOR_SAVE_EVENT, handleMenuSave);
  }, [handleSave, filePath, visible]);

  const updateCells = useCallback(
    (transform: (cells: NotebookCell[]) => NotebookCell[]) => {
      setDocument((current) => {
        if (!current) return current;
        const next = { ...current, cells: transform(current.cells) };
        documentRef.current = next;
        return next;
      });
    },
    [],
  );

  const handleSourceChange = useCallback(
    (cellId: string, source: string) => {
      updateCells((cells) =>
        cells.map((cell) => (cell.id === cellId ? { ...cell, source } : cell)),
      );
    },
    [updateCells],
  );

  const handleRun = useCallback(
    (cellId: string) => {
      const cell = documentRef.current?.cells.find(
        (candidate) => candidate.id === cellId,
      );
      if (!cell || cell.cell_type !== "code") return;
      session.runCell(cellId, cell.source);
    },
    [session],
  );

  const handleRunAll = useCallback(() => {
    const cells = documentRef.current?.cells ?? [];
    for (const cell of cells) {
      if (cell.cell_type === "code") session.runCell(cell.id, cell.source);
    }
  }, [session]);

  const insertCell = useCallback(
    (afterCellId: string | null, cellType: NotebookCellType) => {
      updateCells((cells) => {
        const created = createCell(cellType);
        const index = afterCellId
          ? cells.findIndex((cell) => cell.id === afterCellId) + 1
          : 0;
        const next = [...cells];
        next.splice(index, 0, created);
        return next;
      });
    },
    [updateCells],
  );

  const handleDeleteCell = useCallback(
    (cellId: string) => {
      updateCells((cells) => cells.filter((cell) => cell.id !== cellId));
      session.resetCell(cellId);
    },
    [session, updateCells],
  );

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
        Opening notebook...
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--axon-error-foreground,#e06c75)]">
          {error ?? "The notebook could not be opened."}
        </span>
      </div>
    );
  }

  const kernelBusy = session.kernelStatus === "busy";
  const anyRunning = Object.values(cellRuntime).some(
    (runtime) => runtime.status === "running",
  );

  return (
    <div className="flex h-full w-full flex-col bg-[var(--axon-editor-background)]">
      <NotebookToolbar
        kernelStatus={session.kernelStatus}
        kernelName={session.kernelName}
        saving={saving}
        running={anyRunning}
        onRunAll={handleRunAll}
        onInterrupt={session.interrupt}
        onRestart={session.restart}
        onInsertCode={() => insertCell(null, "code")}
        onInsertMarkdown={() => insertCell(null, "markdown")}
      />
      <div className="min-h-0 flex-1 overflow-auto">
            {document.cells.map((cell) => (
              <NotebookCellView
            key={cell.id}
            cell={cell}
            runtime={cellRuntime[cell.id]}
            editorSettings={editorSettings}
            themeSyntax={themeSyntax}
            themeTokens={themeTokens}
            kernelBusy={kernelBusy}
            onSourceChange={handleSourceChange}
            onRun={handleRun}
            onDelete={handleDeleteCell}
            onInsertBelow={(cellId) => insertCell(cellId, "code")}
          />
        ))}
        {document.cells.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            <span>This notebook has no cells.</span>
            <button
              type="button"
              onClick={() => insertCell(null, "code")}
              className="cursor-pointer rounded border border-[var(--axon-panel-border)] px-2 py-1 opacity-80 transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
            >
              Add a code cell
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
