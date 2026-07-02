import { DiffEditor } from "@monaco-editor/react";
import { type EditorSettings } from "@axon-editor/shared/settings";
import { editorFontStack } from "@axon-editor/renderer/shared/lib/fonts";
import { getMonacoThemeId, registerAxonTheme } from "@axon-editor/renderer/shared/lib/soraTheme";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import { detectLanguage } from "@axon-editor/renderer/features/editor/lib/monacoModels";

interface GitDiffEditorViewProps {
  filePath: string;
  original: string;
  modified: string;
  editorSettings: EditorSettings;
  themeTokens: ResolvedThemeTokens;
}

export default function GitDiffEditorView({
  filePath,
  original,
  modified,
  editorSettings,
  themeTokens,
}: GitDiffEditorViewProps) {
  return (
    <DiffEditor
      height="100%"
      original={original}
      modified={modified}
      language={detectLanguage(filePath)}
      theme={getMonacoThemeId(editorSettings.themeId)}
      beforeMount={(monacoInstance) =>
        registerAxonTheme(monacoInstance, editorSettings.themeId, themeTokens)
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
