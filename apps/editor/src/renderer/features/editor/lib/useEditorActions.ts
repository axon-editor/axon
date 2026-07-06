import { useEffect, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { type ThemeTokenMap } from "../../../shared/themes";
import { type ExtensionThemeSyntaxStyle } from "../../../../shared/extensions";
import {
  inspectEditorToken,
  type TokenInspectorReport,
} from "./tokenInspector";

export type EditorActionRequest =
  | "definition"
  | "references"
  | "rename"
  | "format"
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
  Exclude<EditorActionRequest, "definition" | "inspect-token">,
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
