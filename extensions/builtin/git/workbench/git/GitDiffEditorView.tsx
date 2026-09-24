/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
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
import {
  createSemanticTokenDecorations,
  installSemanticTokenDecorationStyles,
} from "@axon-editor/services/lsp/renderer/semanticTokenDecorations";
import { onDidUpdateSemanticTokens } from "@axon-editor/services/lsp/renderer/lspSemanticTokens";

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
  const [mounted, setMounted] = useState(false);
  const diffEditorRef = useRef<MonacoEditor.IDiffEditor | null>(null);
  const modelsRef = useRef<MonacoEditor.IDiffEditorModel | null>(null);
  const paintCollectionsRef = useRef<
    MonacoEditor.IEditorDecorationsCollection[]
  >([]);

  const handleMount: DiffOnMount = (diffEditor) => {
    diffEditorRef.current = diffEditor;
    modelsRef.current = diffEditor.getModel();
    setMounted(true);
  };

  useEffect(() => {
    if (!mounted) return;
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;

    // The main editor paints Axon's semantic token decorations over Monaco's
    // grammar colors. The diff surfaces re-use the same Monaco theme but skip
    // that overlay, so reading a diff always looked flatter than the code it
    // renders. Painting both sides through the shared pipeline keeps the rich
    // function/type/property captures and theme accents identical to the code.
    installSemanticTokenDecorationStyles(themeTokens, themeSyntax);

    let cancelled = false;
    const paintSide = (
      model: MonacoEditor.ITextModel,
      editor: MonacoEditor.ICodeEditor,
    ) => {
      void createSemanticTokenDecorations(model, themeTokens, themeSyntax)
        .then((decorations) => {
          if (cancelled || model.isDisposed()) return;
          const collection = editor.createDecorationsCollection(decorations);
          paintCollectionsRef.current.push(collection);
        })
        .catch((error) => {
          console.warn("failed to paint semantic diff decorations:", error);
        });
    };

    const models: MonacoEditor.IDiffEditorModel | null = diffEditor.getModel();
    if (models && !models.original.isDisposed() && !models.modified.isDisposed()) {
      paintSide(models.original, diffEditor.getOriginalEditor());
      paintSide(models.modified, diffEditor.getModifiedEditor());

      const subscriptions = [models.original, models.modified].map(
        (model) =>
          onDidUpdateSemanticTokens((updatedModel) => {
            if (updatedModel !== model || updatedModel.isDisposed()) return;
            const editor =
              model === models.original
                ? diffEditor.getOriginalEditor()
                : diffEditor.getModifiedEditor();
            paintSide(model, editor);
          }),
      );

      return () => {
        cancelled = true;
        subscriptions.forEach((subscription) => subscription.dispose());
        paintCollectionsRef.current.forEach((collection) => collection.clear());
        paintCollectionsRef.current = [];
      };
    }

    return undefined;
  }, [mounted, modified, original, themeSyntax, themeTokens]);

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