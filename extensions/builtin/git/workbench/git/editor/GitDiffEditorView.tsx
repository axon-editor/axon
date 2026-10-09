/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { type editor as MonacoEditor } from "monaco-editor";
import { type EditorSettings } from "@axon-editor/shared/core/settings";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions/extensions";
import { editorFontStack } from "@axon-editor/renderer/shared/lib/fonts/fonts";
import {
  getMonacoThemeId,
  registerAxonTheme,
} from "@axon-editor/renderer/shared/lib/theme/soraTheme";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/theme/themeTokens";
import { detectLanguage } from "@axon-editor/renderer/features/editor/lib/buffer/loading/monacoModels";
import {
  createSemanticTokenDecorations,
  installSemanticTokenDecorationStyles,
} from "@axon-editor/services/lsp/renderer/semanticTokens/semanticTokenDecorations";
import { onDidUpdateSemanticTokens } from "@axon-editor/services/lsp/renderer/semanticTokens/lspSemanticTokens";

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
  // One collection per diff side, reused across semantic token updates. Creating
  // a new collection on every update left the previous one live, so decorations
  // stacked on each other until the effect tore them all down.
  const paintCollectionsRef = useRef<{
    original: MonacoEditor.IEditorDecorationsCollection | null;
    modified: MonacoEditor.IEditorDecorationsCollection | null;
  }>({ original: null, modified: null });

  const handleMount: DiffOnMount = (diffEditor) => {
    diffEditorRef.current = diffEditor;
    modelsRef.current = diffEditor.getModel();
    setMounted(true);
  };

  useEffect(() => {
    if (!mounted) return;
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;

    // A single deleted letter inside a word leaves an empty range, which Monaco
    // cannot paint a background on. It falls back to a 3px border whose color is
    // the diff text background, and that token is a low-alpha wash meant to sit
    // behind text, so the marker all but disappears. App.css re-alpha the same
    // variable to 0.9 for .char-insert/.char-delete.diff-range-empty, which keeps
    // one source of color instead of adding a marker-specific key.
    //
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
      side: "original" | "modified",
    ) => {
      void createSemanticTokenDecorations(model, themeTokens, themeSyntax)
        .then((decorations) => {
          if (cancelled || model.isDisposed()) return;
          const existing = paintCollectionsRef.current[side];
          if (existing) {
            existing.set(decorations);
            return;
          }
          paintCollectionsRef.current[side] =
            editor.createDecorationsCollection(decorations);
        })
        .catch((error) => {
          console.warn("failed to paint semantic diff decorations:", error);
        });
    };

    const models: MonacoEditor.IDiffEditorModel | null = diffEditor.getModel();
    if (
      models &&
      !models.original.isDisposed() &&
      !models.modified.isDisposed()
    ) {
      paintSide(models.original, diffEditor.getOriginalEditor(), "original");
      paintSide(models.modified, diffEditor.getModifiedEditor(), "modified");

      const subscriptions = [models.original, models.modified].map((model) =>
        onDidUpdateSemanticTokens((updatedModel) => {
          if (updatedModel !== model || updatedModel.isDisposed()) return;
          const editor =
            model === models.original
              ? diffEditor.getOriginalEditor()
              : diffEditor.getModifiedEditor();
          paintSide(
            model,
            editor,
            model === models.original ? "original" : "modified",
          );
        }),
      );

      return () => {
        cancelled = true;
        subscriptions.forEach((subscription) => subscription.dispose());
        paintCollectionsRef.current.original?.clear();
        paintCollectionsRef.current.modified?.clear();
        paintCollectionsRef.current = { original: null, modified: null };
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
    // The diff panes are read-only editor tabs, so they show the native
    // material the same way the main editor does instead of painting an opaque
    // Monaco background. Unconditional, matching the main editor surface.
    <div className="axon-editor-transparent-surface h-full min-h-0 w-full">
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
    </div>
  );
}
