import type * as monaco from "monaco-editor";
import { type EditorSettings } from "@axon-editor/shared/settings";
import { editorFontStack } from "@axon-editor/renderer/shared/lib/fonts";
import { createEditorFormattingOptions } from "../formatting/editorFormattingOptions";

interface EditorSurfaceOptionsInput {
  editorSettings: EditorSettings;
  largeDocument: boolean;
  readOnly: boolean;
}

const EDITOR_INTERACTION_POLICY = {
  hoverDelay: 100,
  hoverHidingDelay: 80,
  quickSuggestionsDelay: 0,
  topPadding: 16,
} as const;

/**
 * I keep Monaco's construction policy outside the React surface because these
 * values serve two different owners. User choices come from Editor settings,
 * while a smaller set of fixed values protects Axon's token pipeline, virtual
 * tabs, and large-document mode. Keeping both groups in this typed builder
 * makes that distinction explicit and prevents every surface render from
 * manufacturing a new options object that Monaco then has to compare.
 */
export function createEditorSurfaceOptions({
  editorSettings,
  largeDocument,
  readOnly,
}: EditorSurfaceOptionsInput): monaco.editor.IStandaloneEditorConstructionOptions {
  const documentFeaturesEnabled = !largeDocument;
  const foldingEnabled =
    documentFeaturesEnabled && editorSettings.codeFoldingEnabled;
  const snippetsEnabled =
    documentFeaturesEnabled && editorSettings.snippetsEnabled;
  const formattingOptions = createEditorFormattingOptions(editorSettings);
  // During renderer hot reload, the in-memory settings object can predate a
  // newly added preference even though persisted settings are normalized on
  // the next launch. Only an explicit Bottom selection should opt out of the
  // established top-hover behavior, so a temporarily missing value remains
  // equivalent to the persisted Top default without requiring a restart.
  const preferHoverAbove = editorSettings.hoverPlacement !== "bottom";

  return {
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

    // Axon owns one merged TextMate/LSP decoration stream. Monaco's parallel
    // semantic painter would apply the same tokens again and double the model
    // decoration work, especially on large files, without improving the UI.
    "semanticHighlighting.enabled": false,
    largeFileOptimizations: true,

    matchBrackets: documentFeaturesEnabled ? "always" : "never",
    occurrencesHighlight: documentFeaturesEnabled ? "singleFile" : "off",
    selectionHighlight: documentFeaturesEnabled,
    links: documentFeaturesEnabled,
    colorDecorators: documentFeaturesEnabled,
    codeLens: documentFeaturesEnabled,
    inlayHints: { enabled: documentFeaturesEnabled ? "on" : "off" },
    renderValidationDecorations: documentFeaturesEnabled ? "editable" : "off",
    minimap: {
      enabled: documentFeaturesEnabled && editorSettings.minimapEnabled,
    },
    scrollBeyondLastLine: true,
    lineNumbers: "on",
    glyphMargin: documentFeaturesEnabled,
    folding: foldingEnabled,
    showFoldingControls: foldingEnabled ? "mouseover" : "never",
    stickyScroll: {
      enabled: documentFeaturesEnabled && editorSettings.stickyScrollEnabled,
    },
    overviewRulerLanes:
      documentFeaturesEnabled && editorSettings.scrollbarMarkersEnabled ? 3 : 0,
    hideCursorInOverviewRuler:
      !documentFeaturesEnabled || !editorSettings.scrollbarMarkersEnabled,
    multiCursorModifier:
      editorSettings.multiCursorModifier === "ctrlCmd" ? "ctrlCmd" : "alt",
    multiCursorPaste: "spread",
    multiCursorMergeOverlapping: true,
    bracketPairColorization: { enabled: documentFeaturesEnabled },
    ...formattingOptions,
    guides: documentFeaturesEnabled
      ? formattingOptions.guides
      : {
          indentation: false,
          highlightActiveIndentation: false,
          bracketPairs: false,
          bracketPairsHorizontal: false,
          highlightActiveBracketPair: false,
        },
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      useShadows: false,
    },
    quickSuggestions:
      documentFeaturesEnabled && editorSettings.quickSuggestionsEnabled
        ? {
            other: true,
            comments: false,
            strings: true,
          }
        : false,
    quickSuggestionsDelay: EDITOR_INTERACTION_POLICY.quickSuggestionsDelay,
    suggestOnTriggerCharacters:
      documentFeaturesEnabled &&
      editorSettings.triggerCharacterSuggestionsEnabled,
    wordBasedSuggestions:
      documentFeaturesEnabled && editorSettings.wordBasedSuggestionsEnabled
        ? "matchingDocuments"
        : "off",

    // Monaco's hover widget opts into editor overflow by default. When that
    // policy remains enabled, Monaco measures available space against the page
    // and incorrectly counts Axon's tabs and breadcrumb row as usable hover
    // space. Disabling overflow keeps Monaco's own placement algorithm intact,
    // but makes it calculate against the editor viewport whose top edge begins
    // below the breadcrumb row. A preferred Top hover therefore moves below the
    // line automatically when it cannot fit without crossing that boundary.
    allowOverflow: false,
    fixedOverflowWidgets: false,
    hover: {
      enabled: documentFeaturesEnabled ? "on" : "off",
      delay: EDITOR_INTERACTION_POLICY.hoverDelay,
      sticky: true,
      hidingDelay: EDITOR_INTERACTION_POLICY.hoverHidingDelay,
      above: preferHoverAbove,
    },
    acceptSuggestionOnCommitCharacter: true,
    snippetSuggestions: snippetsEnabled ? "top" : "none",
    suggest: {
      showSnippets: snippetsEnabled,
      snippetsPreventQuickSuggestions: false,
      showInlineDetails: false,
      showStatusBar: false,
      preview: editorSettings.suggestionPreviewEnabled,
    },
    inlineSuggest: {
      enabled: documentFeaturesEnabled,
      mode: "prefix",
      showToolbar: "onHover",
      suppressSuggestions: false,
      syntaxHighlightingEnabled: true,
      suppressInSnippetMode: true,
      minShowDelay: 120,
    },
    tabCompletion: snippetsEnabled ? "on" : "off",
    renderLineHighlight: "line",
    padding: { top: EDITOR_INTERACTION_POLICY.topPadding },
    cursorStyle: editorSettings.cursorStyle,
    cursorBlinking: editorSettings.cursorBlinking,
    smoothScrolling: documentFeaturesEnabled,
  };
}
