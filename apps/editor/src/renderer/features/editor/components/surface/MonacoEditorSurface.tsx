import Editor, { type OnMount } from "@monaco-editor/react";
import { type CSSProperties, type RefObject, useMemo } from "react";
import {
  type EditorBackgroundImageFit,
  type EditorSettings,
} from "@axon-editor/shared/settings";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import {
  getMonacoThemeId,
  registerAxonTheme,
} from "@axon-editor/renderer/shared/lib/soraTheme";
import EditorFindWidget from "./EditorFindWidget";
import { createEditorSurfaceOptions } from "../../lib/options/editorSurfaceOptions";

interface Props {
  editorBackgroundImageFit: EditorBackgroundImageFit;
  editorBackgroundImageUrl: string | null;
  editorSettings: EditorSettings;
  findIndex: number;
  findInputRef: RefObject<HTMLInputElement | null>;
  findMatchCount: number;
  findOpen: boolean;
  findQuery: string;
  largeDocument: boolean;
  modelUri: string;
  saving: boolean;
  readOnly: boolean;
  shouldUseTransparentEditorSurface: boolean;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  onChangeFindQuery: (query: string) => void;
  onCloseFind: () => void;
  onMount: OnMount;
  onMoveFindSelection: (direction: 1 | -1) => void;
}

function backgroundImageStyle(
  fit: EditorBackgroundImageFit,
): Pick<
  CSSProperties,
  "backgroundPosition" | "backgroundRepeat" | "backgroundSize"
> {
  switch (fit) {
    case "cover":
      return {
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    case "contain":
      return {
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    case "tile":
      return {
        backgroundSize: "auto",
        backgroundPosition: "top left",
        backgroundRepeat: "repeat",
      };
    default:
      return {
        backgroundSize: "auto",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
  }
}

export default function MonacoEditorSurface({
  editorBackgroundImageFit,
  editorBackgroundImageUrl,
  editorSettings,
  findIndex,
  findInputRef,
  findMatchCount,
  findOpen,
  findQuery,
  largeDocument,
  modelUri,
  saving,
  readOnly,
  shouldUseTransparentEditorSurface,
  themeSyntax,
  themeTokens,
  onChangeFindQuery,
  onCloseFind,
  onMount,
  onMoveFindSelection,
}: Props) {
  const backgroundStyle = backgroundImageStyle(editorBackgroundImageFit);
  const editorOptions = useMemo(
    () =>
      createEditorSurfaceOptions({
        editorSettings,
        largeDocument,
        readOnly,
      }),
    [editorSettings, largeDocument, readOnly],
  );

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${
        shouldUseTransparentEditorSurface
          ? "axon-editor-transparent-surface"
          : ""
      }`}
      style={{
        background: "var(--axon-editor-background)",
      }}
    >
      {editorBackgroundImageUrl ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url("${editorBackgroundImageUrl}")`,
            opacity: editorSettings.backgroundImageOpacity,
            filter:
              editorSettings.backgroundImageBlur > 0
                ? `blur(${editorSettings.backgroundImageBlur}px)`
                : undefined,
            transform:
              editorSettings.backgroundImageBlur > 0
                ? "scale(1.04)"
                : undefined,
            ...backgroundStyle,
          }}
        />
      ) : null}
      {saving && (
        <div className="absolute right-4 top-2 z-10 text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
          saving...
        </div>
      )}
      {findOpen && (
        <EditorFindWidget
          findIndex={findIndex}
          findInputRef={findInputRef}
          findMatchCount={findMatchCount}
          findQuery={findQuery}
          onChangeQuery={onChangeFindQuery}
          onClose={onCloseFind}
          onMoveSelection={onMoveFindSelection}
        />
      )}
      <div className="relative z-10 h-full min-h-0 w-full flex-1 overflow-hidden">
        <Editor
          height="100%"
          path={modelUri}
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
          onMount={onMount}
          // The same Monaco ITextModel can be attached to multiple editor
          // widgets when the same file is open in more than one split. The
          // React wrapper disposes the current model by default when a widget
          // unmounts, which means closing the right split can destroy the model
          // still being rendered by the left split. Keeping the model here lets
          // monacoModels.ts remain the single owner of model disposal through its
          // pane-aware ref count.
          keepCurrentModel
          options={editorOptions}
        />
      </div>
    </div>
  );
}
