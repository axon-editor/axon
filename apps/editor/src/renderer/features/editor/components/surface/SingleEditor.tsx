import { useCallback, useEffect, useRef, useState } from "react";
import { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { type EditorSettings } from "@axon-editor/shared/settings";
import { isLargeDocumentModel } from "@axon-editor/shared/largeDocument";
import { type GitChange } from "@axon-editor/shared/git";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions";
import { type EditorNavigationTarget } from "../../lib/layout/navigation";
import { registerAxonTheme } from "@axon-editor/renderer/shared/lib/soraTheme";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import {
  createSemanticTokenDecorations,
  installSemanticTokenDecorationStyles,
  RICH_SEMANTIC_DECORATION_LANGUAGES,
} from "@axon-editor/services/lsp/renderer/semanticTokenDecorations";
import EditorBreadcrumbHeader from "../navigation/EditorBreadcrumbHeader";
import MonacoEditorSurface from "./MonacoEditorSurface";
import TokenInspectorModal from "../navigation/TokenInspectorModal";
import {
  getModel,
  detectLanguage,
  detectLanguageServerLanguage,
  markModelDirty,
  refreshModelLanguage,
} from "../../lib/buffer/monacoModels";
import { useEditorFind } from "../../lib/hooks/useEditorFind";
import {
  encodeLocalPath,
  goCallExclusions,
  isMarkdown,
  normalizePath,
} from "../../lib/formatting/editorDocumentHelpers";
import { markEditorMounted } from "../../lib/buffer/editorPerformance";
import { type TokenInspectorReport } from "../../lib/inspection/tokenInspector";
import { useEditorActions } from "../../lib/hooks/useEditorActions";
import { useTrailingTask } from "../../lib/hooks/useTrailingTask";
import { useActiveFileServices } from "../../lib/hooks/useActiveFileServices";
import { useEditorIndentationSettings } from "../../lib/hooks/useEditorIndentationSettings";
import { useEditorDiskBaseline } from "../../lib/buffer/useEditorDiskBaseline";
import { useEditorZoomViewport } from "../../lib/hooks/useEditorZoomViewport";
import useGitLineDecorations from "../../lib/git/useGitLineDecorations";
import useGitLineTrace from "../../lib/git/useGitLineTrace";
import { useMarkdownPreviewBridge } from "../../lib/hooks/useMarkdownPreviewBridge";
import { useAxonBufferDocument } from "../../lib/buffer/useAxonBufferDocument";
import { useEditorSave } from "../../lib/hooks/useEditorSave";
import {
  AXON_EDITOR_SAVE_EVENT,
  type EditorSaveEventDetail,
} from "../../lib/buffer/editorSave";
import { EditorErrorState, EditorLoadingState } from "./EditorDocumentState";
import MarkdownEditorModeToolbar, {
  type MarkdownPreviewMode,
} from "./MarkdownEditorModeToolbar";
import EditorPreviewLayout from "./EditorPreviewLayout";
interface Props {
  filePath: string;
  folderPath: string | null;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onOpenFile?: (path: string) => void;
  onOpenMarkdownPreviewTab?: (path: string) => void;
  onOpenNavigationTarget?: (target: Omit<EditorNavigationTarget, "id">) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
}

export default function SingleEditor({
  filePath,
  folderPath,
  visible,
  onDirtyChange,
  onOpenFile,
  onOpenMarkdownPreviewTab,
  onOpenNavigationTarget,
  onCursorChange,
  onLanguageChange,
  editorSettings,
  themeSyntax,
  themeTokens,
  navigationTarget,
  gitChanges,
}: Props) {
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("editor");
  const [editorReadyNonce, setEditorReadyNonce] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [tokenInspectorReport, setTokenInspectorReport] =
    useState<TokenInspectorReport | null>(null);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suggestTimerRef = useRef<number | null>(null);
  const lspSyncTimerRef = useRef<number | null>(null);
  const semanticDecorationTimerRef = useRef<number | null>(null);
  const semanticDecorationRetryTimerRef = useRef<number | null>(null);
  const semanticDecorationRetryRef = useRef({ key: "", count: 0 });
  const semanticDecorationRequestRef = useRef(0);
  const navigationDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const semanticDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const goSyntaxDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const editorOpenerRef = useRef<monaco.IDisposable | null>(null);
  const filePathRef = useRef(filePath);
  const refreshAfterBufferAttachRef = useRef<() => void>(() => undefined);
  const {
    isModelDirty,
    recordLoadedDiskContent,
    recordSynchronizedDiskContent,
  } = useEditorDiskBaseline({ editorRef, filePathRef, onDirtyChange });
  const {
    error,
    largeDocument,
    liveContent,
    loading,
    readOnly,
    setLargeDocument,
    setLiveContent,
  } = useAxonBufferDocument({
    editorRef,
    filePath,
    filePathRef,
    folderPath,
    onDirtyChange,
    recordLoadedDiskContent,
    recordSynchronizedDiskContent,
    refreshAfterAttachRef: refreshAfterBufferAttachRef,
  });
  const { save: handleSave, saving } = useEditorSave({
    editorRef,
    editorSettings,
    filePathRef,
    folderPath,
    readOnly,
  });
  const trackEditorZoomViewport = useEditorZoomViewport(
    editorRef,
    editorSettings.fontSize,
    editorSettings.lineHeight,
  );
  const isMd = isMarkdown(filePath);
  const {
    trackEditorScroll: trackMarkdownEditorScroll,
    updateMarkdownContent,
  } = useMarkdownPreviewBridge({
    editorRef,
    filePath,
    isMarkdown: isMd,
    setLiveContent,
  });
  const scheduleLiveContentUpdate = useTrailingTask();
  const scheduleGoSyntaxUpdate = useTrailingTask();
  const editorBackgroundImagePath = editorSettings.backgroundImagePath.trim();
  const editorBackgroundImageUrl = editorBackgroundImagePath
    ? `axon://local${encodeLocalPath(editorBackgroundImagePath)}`
    : "";
  const shouldUseTransparentEditorSurface =
    editorSettings.appTransparency || Boolean(editorBackgroundImageUrl);
  const gitChange = gitChanges?.find(
    (change) => normalizePath(change.absolutePath) === normalizePath(filePath),
  );
  const scheduleGitDecorationRefresh = useGitLineDecorations({
    editorRef,
    editorReadyNonce,
    filePath,
    folderPath,
    gitChange,
    loading,
    themeTokens,
  });
  useGitLineTrace({
    editorRef,
    editorReadyNonce,
    enabled: editorSettings.lineTraceEnabled,
    filePath,
    folderPath,
    loading,
    visible,
  });

  const {
    changeFindQuery,
    clearFindDecorations,
    closeFind,
    findIndex,
    findInputRef,
    findMatchCount,
    findOpen,
    findQuery,
    moveFindSelection,
    openFind,
  } = useEditorFind({
    editorRef,
    filePathRef,
    liveContent,
    loading,
    visible,
    setPreviewMode,
  });

  const jumpToDefinition = useCallback(async () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position || !folderPath) return false;
    if (isLargeDocumentModel(model)) return false;

    const languageId = detectLanguageServerLanguage(filePath);
    if (languageId === "plaintext") return false;

    try {
      const request = {
        folderPath,
        filePath,
        languageId,
        content: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      };

      await window.axon.syncLanguageServerDocument(request);
      const result = await window.axon.getLanguageServerDefinitions(request);
      const firstLocation = result.ok ? result.locations[0] : null;
      if (!firstLocation) return false;

      // The command palette and keyboard shortcut should jump like an editor,
      // not require the user to open Monaco's peek widget and click the target
      // manually. I ask the LSP directly, then hand the resolved file/range to
      // Axon's tab navigation so unopened target files are mounted before the
      // reveal happens.
      onOpenNavigationTarget?.({
        path: firstLocation.filePath,
        line: firstLocation.range.start.line + 1,
        column: firstLocation.range.start.character + 1,
        length: Math.max(
          1,
          firstLocation.range.end.character -
            firstLocation.range.start.character,
        ),
      });
      return true;
    } catch (err) {
      console.error("failed to jump to definition:", err);
      return false;
    }
  }, [filePath, folderPath, onOpenNavigationTarget]);

  const syncDocumentWithLanguageServer = useCallback(() => {
    if (!folderPath) return;
    const languageId = detectLanguageServerLanguage(filePathRef.current);
    if (languageId === "plaintext") return;

    // Diagnostics are pushed by the language server after it sees the latest
    // in-memory document. I debounce the full-text sync because users can
    // type many edits in a burst, and sending every single keystroke through
    // IPC would make the editor feel heavier without producing more useful
    // diagnostics.
    if (lspSyncTimerRef.current) {
      window.clearTimeout(lspSyncTimerRef.current);
    }
    lspSyncTimerRef.current = window.setTimeout(() => {
      const model = editorRef.current?.getModel();
      if (!model || model.isDisposed() || isLargeDocumentModel(model)) return;
      void window.axon.syncLanguageServerDocument({
        folderPath,
        filePath: filePathRef.current,
        languageId,
        content: model.getValue(),
      });
    }, 320);
  }, [folderPath]);

  const refreshGoSyntaxDecorations = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (
      !editor ||
      !model ||
      model.getLanguageId() !== "go" ||
      isLargeDocumentModel(model)
    ) {
      goSyntaxDecorationsRef.current?.clear();
      return;
    }

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const decoratedRanges = new Set<string>();
    const addDecoration = (
      lineNumber: number,
      startColumn: number,
      endColumn: number,
      className: string,
    ) => {
      const key = `${lineNumber}:${startColumn}:${endColumn}`;
      if (decoratedRanges.has(key)) return;
      decoratedRanges.add(key);
      decorations.push({
        range: new monaco.Range(lineNumber, startColumn, lineNumber, endColumn),
        options: {
          inlineClassName: className,
        },
      });
    };

    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
      const line = model.getLineContent(lineNumber);
      const commentStart = line.indexOf("//");
      const searchableLine =
        commentStart >= 0 ? line.slice(0, commentStart) : line;

      const declarationPattern =
        /\bfunc\s+(\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
      let declarationMatch: RegExpExecArray | null;
      while ((declarationMatch = declarationPattern.exec(searchableLine))) {
        const receiver = declarationMatch[1];
        const name = declarationMatch[2];
        const nameStart =
          declarationMatch.index + declarationMatch[0].indexOf(name);
        addDecoration(
          lineNumber,
          nameStart + 1,
          nameStart + name.length + 1,
          receiver ? "axon-go-method-token" : "axon-go-function-token",
        );
      }

      const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callPattern.exec(searchableLine))) {
        const name = callMatch[1];
        if (goCallExclusions.has(name)) continue;
        const nameStart = callMatch.index;
        const previousCharacter = searchableLine[nameStart - 1];
        addDecoration(
          lineNumber,
          nameStart + 1,
          nameStart + name.length + 1,
          previousCharacter === "."
            ? "axon-go-method-token"
            : "axon-go-function-token",
        );
      }
    }

    // Monaco's bundled Go grammar does not identify function names as a
    // distinct token; it reports them as plain identifiers. I add these inline
    // decorations only for Go so the theme can still color function and method
    // names without weakening identifier colors for every other language.
    goSyntaxDecorationsRef.current ??= editor.createDecorationsCollection();
    goSyntaxDecorationsRef.current.set(decorations);
  }, []);

  const refreshSemanticTokenDecorations = useCallback(async () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (
      !editor ||
      !model ||
      model.isDisposed() ||
      isLargeDocumentModel(model)
    ) {
      semanticDecorationsRef.current?.clear();
      return;
    }

    const requestId = (semanticDecorationRequestRef.current += 1);
    const modelVersion = model.getVersionId();
    installSemanticTokenDecorationStyles(themeTokens, themeSyntax);

    try {
      const decorations = await createSemanticTokenDecorations(
        model,
        themeTokens,
        themeSyntax,
      );
      const stillCurrent =
        requestId === semanticDecorationRequestRef.current &&
        editorRef.current === editor &&
        editor.getModel() === model &&
        !model.isDisposed() &&
        model.getVersionId() === modelVersion;
      if (!stillCurrent) return;

      // Monaco's built-in semantic theming is not reliable enough in
      // standalone Electron, so Axon owns the last paint step with inline
      // decorations. The token source is still the shared LSP/TextMate pipeline;
      // this collection only turns the resolved semantic selectors into real
      // CSS classes that cannot be skipped by Monaco's semantic theme matcher.
      semanticDecorationsRef.current ??= editor.createDecorationsCollection();
      semanticDecorationsRef.current.set(decorations);
      const editorNode = editor.getDomNode();
      if (editorNode) {
        editorNode.dataset.axonThemeId = editorSettings.themeId;
        editorNode.dataset.axonThemeSyntaxCount = String(
          Object.keys(themeSyntax).length,
        );
        editorNode.dataset.axonSemanticDecorationCount = String(
          decorations.length,
        );
      }

      const retryKey = `${model.uri.toString()}::${modelVersion}::${editorSettings.themeId}`;
      if (decorations.length > 0) {
        semanticDecorationRetryRef.current = { key: retryKey, count: 0 };
        if (semanticDecorationRetryTimerRef.current) {
          window.clearTimeout(semanticDecorationRetryTimerRef.current);
          semanticDecorationRetryTimerRef.current = null;
        }
      } else if (
        RICH_SEMANTIC_DECORATION_LANGUAGES.has(model.getLanguageId()) &&
        semanticDecorationRetryRef.current.key !== retryKey
      ) {
        semanticDecorationRetryRef.current = { key: retryKey, count: 0 };
      }

      if (
        decorations.length === 0 &&
        RICH_SEMANTIC_DECORATION_LANGUAGES.has(model.getLanguageId()) &&
        semanticDecorationRetryRef.current.key === retryKey &&
        semanticDecorationRetryRef.current.count < 2 &&
        semanticDecorationRetryTimerRef.current === null
      ) {
        semanticDecorationRetryRef.current.count += 1;
        semanticDecorationRetryTimerRef.current = window.setTimeout(() => {
          semanticDecorationRetryTimerRef.current = null;
          void refreshSemanticTokenDecorations();
        }, 700);
      }
    } catch (err) {
      console.error("failed to paint semantic token decorations:", err);
      semanticDecorationsRef.current?.clear();
    }
  }, [editorSettings.themeId, themeSyntax, themeTokens]);

  const scheduleSemanticTokenDecorations = useCallback(
    (delayMs = 48) => {
      if (semanticDecorationTimerRef.current) {
        window.clearTimeout(semanticDecorationTimerRef.current);
      }
      semanticDecorationTimerRef.current = window.setTimeout(() => {
        semanticDecorationTimerRef.current = null;
        void refreshSemanticTokenDecorations();
      }, delayMs);
    },
    [refreshSemanticTokenDecorations],
  );

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    return () => {
      if (suggestTimerRef.current) {
        window.clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      if (lspSyncTimerRef.current) {
        window.clearTimeout(lspSyncTimerRef.current);
        lspSyncTimerRef.current = null;
      }
      if (semanticDecorationTimerRef.current) {
        window.clearTimeout(semanticDecorationTimerRef.current);
        semanticDecorationTimerRef.current = null;
      }
      if (semanticDecorationRetryTimerRef.current) {
        window.clearTimeout(semanticDecorationRetryTimerRef.current);
        semanticDecorationRetryTimerRef.current = null;
      }

      // Monaco decoration collections are tied to the editor widget, not to
      // React's state lifetime. I clear them explicitly when this editor
      // instance unmounts so transient surfaces such as split panes, markdown
      // preview switches, and quick file changes cannot leave stale Git/find
      // overlays attached to the old model. Without this cleanup, repeated
      // edits around the same line can make translucent change colors appear to
      // stack darker than a single added/modified/deleted marker should.
      navigationDecorationsRef.current?.clear();
      semanticDecorationsRef.current?.clear();
      goSyntaxDecorationsRef.current?.clear();
      clearFindDecorations();

      editorOpenerRef.current?.dispose();
      editorOpenerRef.current = null;
      editorRef.current = null;
    };
  }, [clearFindDecorations]);

  const revealNavigationTarget = useCallback(
    (target: EditorNavigationTarget) => {
      const editor = editorRef.current;
      if (!editor || target.path !== filePath) return;

      const lineNumber = Math.max(1, target.line);
      const column = Math.max(1, target.column);
      const length = Math.max(1, target.length ?? 1);
      const range = new monaco.Range(
        lineNumber,
        column,
        lineNumber,
        column + length,
      );

      setPreviewMode("editor");
      editor.setPosition({ lineNumber, column });
      editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
      editor.focus();

      // Search navigation should leave a clear visual anchor, but it should not
      // become another permanent editor marker. A decoration collection gives
      // us one replaceable highlight that is removed shortly after the jump.
      navigationDecorationsRef.current ??= editor.createDecorationsCollection();
      navigationDecorationsRef.current.set([
        {
          range,
          options: {
            className: "axon-navigation-hit",
            inlineClassName: "axon-navigation-hit-inline",
          },
        },
      ]);

      window.setTimeout(() => {
        navigationDecorationsRef.current?.clear();
      }, 1800);
    },
    [filePath],
  );

  useEffect(() => {
    if (visible) {
      onLanguageChange(detectLanguage(filePath));
      onCursorChange(1, 1);
      registerAxonTheme(
        monaco,
        editorSettings.themeId,
        themeTokens,
        [],
        themeSyntax,
      );
      installSemanticTokenDecorationStyles(themeTokens, themeSyntax);
      void refreshSemanticTokenDecorations();
      refreshGoSyntaxDecorations();
    }
  }, [
    visible,
    editorSettings.themeId,
    themeSyntax,
    themeTokens,
    refreshSemanticTokenDecorations,
    refreshGoSyntaxDecorations,
  ]);

  useEffect(() => {
    if (!visible || !navigationTarget || loading) return;
    revealNavigationTarget(navigationTarget);
  }, [
    editorReadyNonce,
    loading,
    navigationTarget,
    revealNavigationTarget,
    visible,
  ]);

  useEditorIndentationSettings(
    editorRef,
    editorSettings,
    editorReadyNonce,
    loading,
    visible,
  );

  useEditorActions({
    editorRef,
    filePath,
    jumpToDefinition,
    setTokenInspectorReport,
    themeSyntax,
    themeTokens,
    visible,
  });

  refreshAfterBufferAttachRef.current = () => {
    scheduleSemanticTokenDecorations();
    scheduleGoSyntaxUpdate(refreshGoSyntaxDecorations, 60);
  };

  useEffect(() => {
    setPreviewMode("editor");
    return () => {
      navigationDecorationsRef.current?.clear();
      navigationDecorationsRef.current = null;
      semanticDecorationsRef.current?.clear();
      semanticDecorationsRef.current = null;
      goSyntaxDecorationsRef.current?.clear();
      goSyntaxDecorationsRef.current = null;
      editorOpenerRef.current?.dispose();
      editorOpenerRef.current = null;
      if (suggestTimerRef.current) {
        window.clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      if (lspSyncTimerRef.current) {
        window.clearTimeout(lspSyncTimerRef.current);
        lspSyncTimerRef.current = null;
      }
      if (semanticDecorationTimerRef.current) {
        window.clearTimeout(semanticDecorationTimerRef.current);
        semanticDecorationTimerRef.current = null;
      }
      if (semanticDecorationRetryTimerRef.current) {
        window.clearTimeout(semanticDecorationRetryTimerRef.current);
        semanticDecorationRetryTimerRef.current = null;
      }
    };
  }, [filePath]);

  useActiveFileServices({
    filePath,
    loading,
    syncDocument: syncDocumentWithLanguageServer,
    visible,
  });

  useEffect(() => {
    const handleMenuSave = (event: Event) => {
      const saveEvent = event as CustomEvent<EditorSaveEventDetail>;
      if (saveEvent.detail?.path !== filePathRef.current) return;
      if (!visible) return;
      const model = editorRef.current?.getModel();
      if (!model || model.isDisposed()) return;

      // preventDefault is an acknowledgement to the app shell, not browser UI
      // suppression. It tells the dispatcher that this visible editor owns view
      // restoration and queued format-on-save for the shared model.
      saveEvent.preventDefault();
      void handleSave();
    };

    window.addEventListener(AXON_EDITOR_SAVE_EVENT, handleMenuSave);
    return () =>
      window.removeEventListener(AXON_EDITOR_SAVE_EVENT, handleMenuSave);
  }, [handleSave, visible]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    setEditorReadyNonce((nonce) => nonce + 1);
    markEditorMounted(filePath);
    trackEditorZoomViewport(editor);
    trackMarkdownEditorScroll(editor);

    registerAxonTheme(
      monaco,
      editorSettings.themeId,
      themeTokens,
      [],
      themeSyntax,
    );
    installSemanticTokenDecorationStyles(themeTokens, themeSyntax);

    // only attach model if it already exists from a previous readFile call
    // if readFile hasn't resolved yet it will call editor.setModel when it does
    const model = getModel(filePath);
    if (model && !model.isDisposed()) {
      editor.setModel(model);
    }

    editorOpenerRef.current?.dispose();
    editorOpenerRef.current = monaco.editor.registerEditorOpener({
      openCodeEditor: (_source, resource, selectionOrPosition) => {
        if (resource.scheme !== "file") return false;

        const targetPath = resource.fsPath;
        const line =
          selectionOrPosition && "startLineNumber" in selectionOrPosition
            ? selectionOrPosition.startLineNumber
            : selectionOrPosition && "lineNumber" in selectionOrPosition
              ? selectionOrPosition.lineNumber
              : 1;
        const column =
          selectionOrPosition && "startColumn" in selectionOrPosition
            ? selectionOrPosition.startColumn
            : selectionOrPosition && "column" in selectionOrPosition
              ? selectionOrPosition.column
              : 1;
        const length =
          selectionOrPosition && "endColumn" in selectionOrPosition
            ? Math.max(1, selectionOrPosition.endColumn - column)
            : 1;

        // Monaco knows how to ask for "open this definition resource", but it
        // does not know Axon's tab and pane model. I do not require `source` to
        // be this exact editor because peek/definition widgets can forward the
        // open request from a Monaco-owned surface. If I reject that first
        // request, the user has to click the definition popup manually before
        // Axon has a warmed model, which makes jump-to-definition feel broken.
        if (onOpenNavigationTarget) {
          onOpenNavigationTarget({
            path: targetPath,
            line,
            column,
            length,
          });
        } else {
          onOpenFile?.(targetPath);
        }
        return true;
      },
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () =>
      openFind(),
    );

    editor.onMouseDown((event) => {
      const browserEvent = event.event.browserEvent;
      const position = event.target.position;
      if (!position) return;
      if (event.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) {
        return;
      }
      if (!(browserEvent.metaKey || browserEvent.ctrlKey)) return;

      // Monaco's built-in modifier-click path prefers its peek widget for some
      // cross-file results. Axon owns tabs and panes, so an actual modifier
      // click should go through the same direct LSP jump path as F12 instead of
      // leaving the user in an intermediate peek surface. I only intercept the
      // real click path here; the normal definition provider still returns
      // locations so Monaco can show link styling while the modifier is held.
      event.event.preventDefault();
      event.event.stopPropagation();
      editor.setPosition(position);
      void jumpToDefinition();
    });

    editor.onDidChangeModelContent((event) => {
      const model = editor.getModel();
      if (!model || model.isDisposed()) return;
      const isLargeDocument = isLargeDocumentModel(model);
      refreshModelLanguage(filePath, model);
      setLargeDocument(isLargeDocument);
      // Monaco owns the live text; React only needs a snapshot for secondary
      // state. Copying the complete buffer on every keystroke made long files
      // pay an O(document size) cost before Monaco could paint the typed text. A
      // trailing read keeps previews and breadcrumbs current without blocking
      // the input event itself.
      if (isLargeDocument) {
        setLiveContent((current) => (current ? "" : current));
      } else {
        scheduleLiveContentUpdate(
          () => {
            if (!model.isDisposed() && editor.getModel() === model) {
              setLiveContent(model.getValue());
            }
          },
          isMd && previewMode === "split" ? 80 : 240,
        );
      }
      const dirty = isModelDirty(model);
      markModelDirty(filePath, dirty);
      onDirtyChange(filePath, dirty);
      if (!isLargeDocument) {
        syncDocumentWithLanguageServer();
        scheduleSemanticTokenDecorations(48);
        scheduleGoSyntaxUpdate(refreshGoSyntaxDecorations, 60);
      }
      // Git gutter markers are positional feedback for the line being edited,
      // so they should not inherit the longer semantic-color delay used by large
      // documents. The diff implementation is already bounded and the hook
      // coalesces typing bursts before repainting.
      if (!isLargeDocument) scheduleGitDecorationRefresh();

      const position = editor.getPosition();
      if (!position) return;

      const languageId = model.getLanguageId();
      const insertedSuggestCharacter = event.changes.some((change) =>
        /[A-Za-z<]/.test(change.text),
      );
      const currentWord = model.getWordUntilPosition(position).word;
      const canSuggestWebCode =
        languageId === "html" ||
        languageId === "javascript" ||
        languageId === "javascriptreact" ||
        languageId === "typescript" ||
        languageId === "typescriptreact";

      if (!canSuggestWebCode || !insertedSuggestCharacter) return;
      if (
        currentWord.length === 0 &&
        !event.changes.some((change) => change.text.includes("<"))
      ) {
        return;
      }

      // Monaco normally opens quick suggestions on its own, but Electron/Vite
      // timing plus custom providers can make that feel inconsistent. This
      // small debounce explicitly opens the suggest widget for web languages
      // after normal typing, which is the behavior users expect when they type
      // common tags like `div` in HTML or JSX/TSX.
      if (suggestTimerRef.current) {
        window.clearTimeout(suggestTimerRef.current);
      }
      suggestTimerRef.current = window.setTimeout(() => {
        editor.trigger("axon", "editor.action.triggerSuggest", {});
      }, 20);
    });

    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
      });
      if (visible) {
        onCursorChange(e.position.lineNumber, e.position.column);
      }
    });

    onLanguageChange(detectLanguage(filePath));
    void refreshSemanticTokenDecorations();
    refreshGoSyntaxDecorations();
  };

  if (error) {
    return <EditorErrorState error={error} filePath={filePath} />;
  }

  if (loading) {
    return <EditorLoadingState />;
  }

  const breadcrumbNode = editorSettings.breadcrumbsEnabled ? (
    <EditorBreadcrumbHeader
      cursorLine={cursorPosition.line}
      editorRef={editorRef}
      filePath={filePath}
      largeDocument={largeDocument}
      liveContent={liveContent}
    />
  ) : null;

  const editorNode = (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-axon-editor-path={filePath}
    >
      {breadcrumbNode}
      <MonacoEditorSurface
        editorBackgroundImageFit={editorSettings.backgroundImageFit}
        editorBackgroundImageUrl={editorBackgroundImageUrl || null}
        editorSettings={editorSettings}
        findIndex={findIndex}
        findInputRef={findInputRef}
        findMatchCount={findMatchCount}
        findOpen={findOpen}
        findQuery={findQuery}
        largeDocument={largeDocument}
        modelUri={monaco.Uri.file(filePath).toString()}
        saving={saving}
        readOnly={readOnly}
        shouldUseTransparentEditorSurface={shouldUseTransparentEditorSurface}
        themeSyntax={themeSyntax}
        themeTokens={themeTokens}
        onChangeFindQuery={changeFindQuery}
        onCloseFind={closeFind}
        onMount={handleEditorMount}
        onMoveFindSelection={moveFindSelection}
      />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col">
      {tokenInspectorReport && (
        <TokenInspectorModal
          report={tokenInspectorReport}
          onClose={() => setTokenInspectorReport(null)}
        />
      )}
      {isMd && (
        <MarkdownEditorModeToolbar
          filePath={filePath}
          mode={previewMode}
          onChangeMode={setPreviewMode}
          onOpenPreview={onOpenMarkdownPreviewTab}
        />
      )}

      <EditorPreviewLayout
        content={liveContent}
        editor={editorNode}
        filePath={filePath}
        folderPath={folderPath}
        mode={previewMode}
        onContentChange={updateMarkdownContent}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}
