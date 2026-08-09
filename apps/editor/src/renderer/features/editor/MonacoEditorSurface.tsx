import Editor, { type OnMount } from "@monaco-editor/react";
import { type CSSProperties, type RefObject } from "react";
import {
  type EditorBackgroundImageFit,
  type EditorSettings,
} from "../../../shared/settings";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import { editorFontStack } from "../../shared/lib/fonts";
import {
  getMonacoThemeId,
  registerAxonTheme,
} from "../../shared/lib/soraTheme";
import EditorFindWidget from "./EditorFindWidget";
import { createEditorFormattingOptions } from "./lib/editorFormattingOptions";

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
  const formattingOptions = createEditorFormattingOptions(editorSettings);

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
          options={{
            readOnly,
            readOnlyMessage: {
              value: "Dependency and standard-library source is read-only.",
            },
            fontSize: editorSettings.fontSize,
            fontFamily: editorFontStack(editorSettings.fontFamily),
            fontWeight: String(editorSettings.fontWeight),
            lineHeight: editorSettings.lineHeight,
            letterSpacing: 0,
            fontLigatures: editorSettings.fontLigatures,
            tabSize: editorSettings.tabSize,
            insertSpaces: editorSettings.insertSpaces,
            detectIndentation: editorSettings.detectIndentation,
            // Axon paints its merged TextMate/LSP tokens through one custom
            // decoration collection. Enabling Monaco's semantic painter here
            // makes the same full-document token stream get applied a second
            // time, doubling model decoration work on large files without
            // changing the visible result.
            "semanticHighlighting.enabled": false,
            // Monaco already virtualizes view lines, but several optional
            // editor features still build document-wide indexes. Large-file
            // mode turns those secondary indexes off while normal navigation
            // and editing remain available.
            largeFileOptimizations: true,
            matchBrackets: largeDocument ? "never" : "always",
            occurrencesHighlight: largeDocument ? "off" : "singleFile",
            selectionHighlight: !largeDocument,
            links: !largeDocument,
            colorDecorators: !largeDocument,
            codeLens: !largeDocument,
            inlayHints: { enabled: largeDocument ? "off" : "on" },
            renderValidationDecorations: largeDocument ? "off" : "editable",
            minimap: {
              enabled: !largeDocument && editorSettings.minimapEnabled,
            },
            scrollBeyondLastLine: true,
            lineNumbers: "on",
            glyphMargin: !largeDocument,
            folding: !largeDocument && editorSettings.codeFoldingEnabled,
            showFoldingControls:
              !largeDocument && editorSettings.codeFoldingEnabled
                ? "mouseover"
                : "never",
            stickyScroll: {
              enabled: !largeDocument && editorSettings.stickyScrollEnabled,
            },
            overviewRulerLanes:
              !largeDocument && editorSettings.scrollbarMarkersEnabled ? 3 : 0,
            hideCursorInOverviewRuler:
              largeDocument || !editorSettings.scrollbarMarkersEnabled,
            multiCursorModifier:
              editorSettings.multiCursorModifier === "ctrlCmd"
                ? "ctrlCmd"
                : "alt",
            multiCursorPaste: "spread",
            multiCursorMergeOverlapping: true,
            bracketPairColorization: { enabled: !largeDocument },
            ...formattingOptions,
            guides: largeDocument
              ? {
                  indentation: false,
                  highlightActiveIndentation: false,
                  bracketPairs: false,
                  bracketPairsHorizontal: false,
                  highlightActiveBracketPair: false,
                }
              : formattingOptions.guides,
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
              useShadows: false,
            },
            quickSuggestions:
              !largeDocument && editorSettings.quickSuggestionsEnabled
                ? {
                    other: true,
                    comments: false,
                    strings: true,
                  }
                : false,
            quickSuggestionsDelay: 0,
            suggestOnTriggerCharacters:
              !largeDocument &&
              editorSettings.triggerCharacterSuggestionsEnabled,
            wordBasedSuggestions:
              !largeDocument && editorSettings.wordBasedSuggestionsEnabled
                ? "matchingDocuments"
                : "off",
            hover: { enabled: !largeDocument, delay: 100, sticky: true },
            acceptSuggestionOnCommitCharacter: true,
            snippetSuggestions:
              !largeDocument && editorSettings.snippetsEnabled ? "top" : "none",
            suggest: {
              showSnippets: !largeDocument && editorSettings.snippetsEnabled,
              snippetsPreventQuickSuggestions: false,
              showInlineDetails: false,
              showStatusBar: false,
              preview: editorSettings.suggestionPreviewEnabled,
            },
            tabCompletion:
              !largeDocument && editorSettings.snippetsEnabled ? "on" : "off",
            renderLineHighlight: "line",
            padding: { top: 16 },
            cursorStyle: editorSettings.cursorStyle,
            cursorBlinking: editorSettings.cursorBlinking,
            smoothScrolling: !largeDocument,
          }}
        />
      </div>
    </div>
  );
}
