import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { type editor as MonacoEditor } from "monaco-editor";
import { type EditorSettings } from "@axon-editor/shared/settings";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions";
import { editorFontStack } from "@axon-editor/renderer/shared/lib/fonts";
import {
  getMonacoThemeId,
  registerAxonTheme,
} from "@axon-editor/renderer/shared/lib/soraTheme";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import { detectLanguage } from "@axon-editor/renderer/features/editor/lib/buffer/monacoModels";

interface GitDiffEditorViewProps {
  filePath: string;
  original: string;
  modified: string;
  editorSettings: EditorSettings;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
}

export default function GitDiffEditorView({
  filePath,
  original,
  modified,
  editorSettings,
  themeSyntax,
  themeTokens,
}: GitDiffEditorViewProps) {
  const modelsRef = useRef<MonacoEditor.IDiffEditorModel | null>(null);

  const handleMount: DiffOnMount = (diffEditor) => {
    modelsRef.current = diffEditor.getModel();
  };

  useEffect(
    () => () => {
      const models = modelsRef.current;
      modelsRef.current = null;
      if (!models) return;

      // The React Monaco wrapper normally disposes both text models before it
      // disposes the diff widget. Recent Monaco versions reject that order
      // because the widget still references those models. I retain ownership
      // in the wrapper, then release the detached models in a microtask after
      // React has completed every child cleanup for this unmount.
      queueMicrotask(() => {
        if (!models.original.isDisposed()) models.original.dispose();
        if (!models.modified.isDisposed()) models.modified.dispose();
      });
    },
    [],
  );

  return (
    <DiffEditor
      height="100%"
      original={original}
      modified={modified}
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      onMount={handleMount}
      language={detectLanguage(filePath)}
      theme={getMonacoThemeId(editorSettings.themeId)}
      beforeMount={(monacoInstance) =>
        registerAxonTheme(
          monacoInstance,
          editorSettings.themeId,
          themeTokens,
          [],
          themeSyntax,
        )
      }
      options={{
        readOnly: true,
        renderSideBySide: true,
        fontSize: editorSettings.fontSize,
        fontFamily: editorFontStack(editorSettings.fontFamily),
        fontWeight: String(editorSettings.fontWeight),
        lineHeight: editorSettings.lineHeight,
        letterSpacing: 0,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        originalEditable: false,
      }}
    />
  );
}
