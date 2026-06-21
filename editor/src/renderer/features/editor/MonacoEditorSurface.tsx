import Editor, { type OnMount } from "@monaco-editor/react";
import { type CSSProperties, type RefObject } from "react";
import {
  type EditorBackgroundImageFit,
  type EditorSettings,
} from "../../../shared/settings";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import { editorFontStack } from "../../shared/lib/fonts";
import { getMonacoThemeId, registerAxonTheme } from "../../shared/lib/soraTheme";
import EditorFindWidget from "./EditorFindWidget";

interface Props {
  editorBackgroundImageFit: EditorBackgroundImageFit;
  editorBackgroundImageUrl: string | null;
  editorSettings: EditorSettings;
  findIndex: number;
  findInputRef: RefObject<HTMLInputElement | null>;
  findMatchCount: number;
  findOpen: boolean;
  findQuery: string;
  saving: boolean;
  shouldUseTransparentEditorSurface: boolean;
  themeTokens: ResolvedThemeTokens;
  onChangeFindQuery: (query: string) => void;
  onCloseFind: () => void;
  onMount: OnMount;
  onMoveFindSelection: (direction: 1 | -1) => void;
}

function backgroundImageStyle(
  fit: EditorBackgroundImageFit,
): Pick<CSSProperties, "backgroundPosition" | "backgroundRepeat" | "backgroundSize"> {
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
  saving,
  shouldUseTransparentEditorSurface,
  themeTokens,
  onChangeFindQuery,
  onCloseFind,
  onMount,
  onMoveFindSelection,
}: Props) {
  const backgroundStyle = backgroundImageStyle(editorBackgroundImageFit);

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
              editorSettings.backgroundImageBlur > 0 ? "scale(1.04)" : undefined,
            ...backgroundStyle,
          }}
        />
      ) : null}
      {saving && (
        <div className="absolute top-2 right-4 text-[11px] text-[#586478] z-10">
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
          theme={getMonacoThemeId(editorSettings.themeId)}
          beforeMount={(monacoInstance) =>
            registerAxonTheme(monacoInstance, editorSettings.themeId, themeTokens)
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
          options={{
            fontSize: editorSettings.fontSize,
            fontFamily: editorFontStack(editorSettings.fontFamily),
            fontWeight: String(editorSettings.fontWeight),
            lineHeight: editorSettings.lineHeight,
            letterSpacing: 0,
            fontLigatures: editorSettings.fontLigatures,
            "semanticHighlighting.enabled": true,
            minimap: { enabled: editorSettings.minimapEnabled },
            scrollBeyondLastLine: true,
            lineNumbers: "on",
            glyphMargin: true,
            folding: editorSettings.codeFoldingEnabled,
            showFoldingControls: editorSettings.codeFoldingEnabled
              ? "mouseover"
              : "never",
            stickyScroll: { enabled: editorSettings.stickyScrollEnabled },
            overviewRulerLanes: editorSettings.scrollbarMarkersEnabled ? 3 : 0,
            hideCursorInOverviewRuler: !editorSettings.scrollbarMarkersEnabled,
            multiCursorModifier:
              editorSettings.multiCursorModifier === "ctrlCmd"
                ? "ctrlCmd"
                : "alt",
            multiCursorPaste: "spread",
            multiCursorMergeOverlapping: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
              highlightActiveIndentation: true,
            },
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
              useShadows: false,
            },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true,
            },
            quickSuggestionsDelay: 0,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnCommitCharacter: true,
            snippetSuggestions: editorSettings.snippetsEnabled ? "top" : "none",
            suggest: {
              showSnippets: editorSettings.snippetsEnabled,
              snippetsPreventQuickSuggestions: false,
            },
            tabCompletion: editorSettings.snippetsEnabled ? "on" : "off",
            renderLineHighlight: "line",
            padding: { top: 16 },
            cursorStyle: editorSettings.cursorStyle,
            cursorBlinking: editorSettings.cursorBlinking,
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
}
