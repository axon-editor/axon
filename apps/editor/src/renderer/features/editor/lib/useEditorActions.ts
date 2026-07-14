import { useEffect, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { type ThemeTokenMap } from "../../../shared/themes";
import { type ExtensionThemeSyntaxStyle } from "../../../../shared/extensions";
import {
  inspectEditorToken,
  type TokenInspectorReport,
} from "./tokenInspector";
import { requestCodeSnapshot } from "@axon-builtin-code-snapshot/lib/codeSnapshotTabs";

export type EditorActionRequest =
  | "definition"
  | "references"
  | "rename"
  | "format"
  | "snapshot"
  | "inspect-token";

interface UseEditorActionsOptions {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  jumpToDefinition: () => Promise<boolean>;
  setTokenInspectorReport: (report: TokenInspectorReport | null) => void;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ThemeTokenMap;
  visible: boolean;
}

const monacoActionByRequest: Record<
  Exclude<EditorActionRequest, "definition" | "inspect-token" | "snapshot">,
  string
> = {
  references: "editor.action.referenceSearch.trigger",
  rename: "editor.action.rename",
  format: "editor.action.formatDocument",
};

export function useEditorActions({
  editorRef,
  filePath,
  jumpToDefinition,
  setTokenInspectorReport,
  themeSyntax,
  themeTokens,
  visible,
}: UseEditorActionsOptions) {
  useEffect(() => {
    const handleEditorAction = (event: Event) => {
      const actionEvent = event as CustomEvent<{
        path?: string;
        action?: EditorActionRequest;
      }>;
      if (!visible || actionEvent.detail?.path !== filePath) return;

      const editor = editorRef.current;
      if (!editor) return;

      const action = actionEvent.detail.action ?? "definition";
      if (action === "inspect-token") {
        void inspectEditorToken(editor, filePath, themeTokens, themeSyntax).then(
          (report) => {
            if (report) setTokenInspectorReport(report);
          },
        );
        return;
      }

      if (action === "snapshot") {
        const model = editor.getModel();
        if (!model) return;

        const selection = editor.getSelection();
        const visibleRange = editor.getVisibleRanges()[0];
        const hasSelection = Boolean(selection && !selection.isEmpty());
        const startLine = hasSelection
          ? selection!.startLineNumber
          : (visibleRange?.startLineNumber ?? 1);
        let endLine = hasSelection
          ? selection!.endLineNumber
          : (visibleRange?.endLineNumber ?? Math.min(20, model.getLineCount()));

        // A line selection ending at column one uses that final position as a
        // boundary. Excluding it keeps the snapshot from gaining an unrelated
        // blank line below the code the user actually selected.
        if (hasSelection && endLine > startLine && selection!.endColumn === 1) {
          endLine -= 1;
        }

        requestCodeSnapshot({
          content: model.getValue(),
          endLine: Math.min(model.getLineCount(), endLine),
          filePath,
          languageId: model.getLanguageId(),
          startLine,
        });
        return;
      }

      if (action === "definition") {
        void jumpToDefinition().then((jumped) => {
          if (!jumped) {
            void editor.getAction("editor.action.revealDefinition")?.run();
          }
        });
        return;
      }

      // Monaco owns the final UI for reference search, rename inputs, and
      // formatter edits. Definition is handled above because Monaco may stop at
      // a peek popup before Axon's tab model has loaded the target file.
      void editor.getAction(monacoActionByRequest[action])?.run();
    };

    window.addEventListener("axon:editorAction", handleEditorAction);
    return () =>
      window.removeEventListener("axon:editorAction", handleEditorAction);
  }, [
    editorRef,
    filePath,
    jumpToDefinition,
    setTokenInspectorReport,
    themeSyntax,
    themeTokens,
    visible,
  ]);
}
