import { useCallback, useMemo, useState, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { collectFileSymbols } from "@axon-editor/renderer/features/sidebar/files/lib/fileSymbols";
import { normalizePath } from "../../lib/formatting/editorDocumentHelpers";
import EditorBreadcrumbs from "./EditorBreadcrumbs";

interface Props {
  cursorLine: number;
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  largeDocument: boolean;
  liveContent: string;
}

export default function EditorBreadcrumbHeader({
  cursorLine,
  editorRef,
  filePath,
  largeDocument,
  liveContent,
}: Props) {
  const [open, setOpen] = useState(false);
  const breadcrumbSegments = useMemo(
    () => normalizePath(filePath).split("/").filter(Boolean).slice(-4),
    [filePath],
  );
  const symbols = useMemo(
    () => (largeDocument ? [] : collectFileSymbols(liveContent)),
    [largeDocument, liveContent],
  );
  const activeSymbol = [...symbols]
    .reverse()
    .find((symbol) => symbol.line <= cursorLine);

  const jumpToSymbol = useCallback(
    (symbol: { line: number; column: number }) => {
      setOpen(false);
      const editor = editorRef.current;
      if (!editor) return;
      const position = {
        lineNumber: Math.max(1, symbol.line),
        column: Math.max(1, symbol.column),
      };
      editor.setPosition(position);
      editor.revealPositionInCenter(position, monaco.editor.ScrollType.Smooth);
      editor.focus();
    },
    [editorRef],
  );

  return (
    <EditorBreadcrumbs
      activeSymbol={activeSymbol}
      breadcrumbSegments={breadcrumbSegments}
      filePath={filePath}
      open={open}
      symbols={symbols}
      onSelectSymbol={jumpToSymbol}
      onToggleOpen={() => setOpen((current) => !current)}
      onClose={() => setOpen(false)}
    />
  );
}
