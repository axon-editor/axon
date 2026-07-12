// Renders a Monaco editor instance for a single file.
// Uses shared Monaco models via monacoModels.ts so multiple panes
// showing the same file share one model and edits reflect instantly
// across all panes without saving.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  Columns2,
  Eye,
  FileText,
  FileWarning,
} from "lucide-react";
import { type EditorSettings } from "../../../shared/settings";
import { type GitChange } from "../../../shared/git";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import { readFile, writeFile } from "../../shared/lib/api";
import { type EditorNavigationTarget } from "./lib/navigation";
import { registerAxonTheme } from "../../shared/lib/soraTheme";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import {
  createSemanticTokenDecorations,
  installSemanticTokenDecorationStyles,
} from "../../../services/lsp/renderer/semanticTokenDecorations";
import { parseGitDiffLineDecorations } from "@axon-builtin-git/git/lib/gitDiffDecorations";
import Tooltip from "../../shared/components/Tooltip";
import MarkdownPreview from "@axon-builtin-markdown/MarkdownPreview";
import EditorBreadcrumbs from "./EditorBreadcrumbs";
import MonacoEditorSurface from "./MonacoEditorSurface";
import TokenInspectorModal from "./TokenInspectorModal";
import {
  updateModel,
  releaseModel,
  acquireModel,
  getModel,
  detectLanguage,
  detectLanguageServerLanguage,
} from "./lib/monacoModels";
import { collectFileSymbols } from "../sidebar/files/lib/fileSymbols";
import { useEditorFind } from "./lib/useEditorFind";
import {
  encodeLocalPath,
  goCallExclusions,
  isMarkdown,
  normalizePath,
  toMonacoEdit,
} from "./lib/editorDocumentHelpers";
import { markEditorMounted } from "./lib/editorPerformance";
import { type TokenInspectorReport } from "./lib/tokenInspector";
import { useEditorActions } from "./lib/useEditorActions";
import { useTrailingTask } from "./lib/useTrailingTask";
import { useActiveFileServices } from "./lib/useActiveFileServices";

interface Props {
  filePath: string;
  folderPath: string | null;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onOpenFile?: (path: string) => void;
  onOpenMarkdownPreviewTab?: (path: string) => void;
  onOpenNavigationTarget?: (
    target: Omit<EditorNavigationTarget, "id">,
  ) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
}

type PreviewMode = "editor" | "split";
const richSemanticDecorationLanguages = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "go",
  "rust",
  "python",
]);

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
  const [liveContent, setLiveContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("editor");
  const [editorReadyNonce, setEditorReadyNonce] = useState(0);
  const [bufferSymbolsOpen, setBufferSymbolsOpen] = useState(false);
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
  const gitDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const semanticDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const goSyntaxDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const editorOpenerRef = useRef<monaco.IDisposable | null>(null);
  const diskContentRef = useRef("");
  const filePathRef = useRef(filePath);
  const isMd = isMarkdown(filePath);
  const scheduleLiveContentUpdate = useTrailingTask();
  const scheduleGoSyntaxUpdate = useTrailingTask();
  const editorBackgroundImagePath = editorSettings.backgroundImagePath.trim();
  const editorBackgroundImageUrl = editorBackgroundImagePath
    ? `axon://local${encodeLocalPath(editorBackgroundImagePath)}`
    : "";
  const shouldUseTransparentEditorSurface =
    editorSettings.appTransparency ||
    Boolean(editorBackgroundImageUrl);
  const gitChange = gitChanges?.find(
    (change) => normalizePath(change.absolutePath) === normalizePath(filePath),
  );

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

  const jumpToBreadcrumbSymbol = useCallback((line: number, column: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    // Breadcrumb symbols are navigation, not just labels. I reveal the target
    // in the mounted Monaco model and focus the editor so clicking a function,
    // method, interface, or const behaves like Zed's buffer outline instead of
    // leaving focus trapped in the breadcrumb popover.
    const position = {
      lineNumber: Math.max(1, line),
      column: Math.max(1, column),
    };
    editor.setPosition(position);
    editor.revealPositionInCenter(position, monaco.editor.ScrollType.Smooth);
    editor.focus();
  }, []);

  const jumpToBufferSymbol = useCallback(
    (symbol: { line: number; column: number }) => {
      setBufferSymbolsOpen(false);
      jumpToBreadcrumbSymbol(symbol.line, symbol.column);
    },
    [jumpToBreadcrumbSymbol],
  );

  const jumpToDefinition = useCallback(async () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position || !folderPath) return false;

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

  const syncDocumentWithLanguageServer = useCallback(
    (content: string) => {
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
        void window.axon.syncLanguageServerDocument({
          folderPath,
          filePath: filePathRef.current,
          languageId,
          content,
        });
      }, 320);
    },
    [folderPath],
  );

  const refreshGoSyntaxDecorations = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.getLanguageId() !== "go") {
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
        range: new monaco.Range(
          lineNumber,
          startColumn,
          lineNumber,
          endColumn,
        ),
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
    if (!editor || !model || model.isDisposed()) {
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
        editorNode.dataset.axonThemeSyntaxCount =
          String(Object.keys(themeSyntax).length);
        editorNode.dataset.axonSemanticDecorationCount =
          String(decorations.length);
      }

      const retryKey = `${model.uri.toString()}::${modelVersion}::${editorSettings.themeId}`;
      if (decorations.length > 0) {
        semanticDecorationRetryRef.current = { key: retryKey, count: 0 };
        if (semanticDecorationRetryTimerRef.current) {
          window.clearTimeout(semanticDecorationRetryTimerRef.current);
          semanticDecorationRetryTimerRef.current = null;
        }
      } else if (
        richSemanticDecorationLanguages.has(model.getLanguageId()) &&
        semanticDecorationRetryRef.current.key !== retryKey
      ) {
        semanticDecorationRetryRef.current = { key: retryKey, count: 0 };
      }

      if (
        decorations.length === 0 &&
        richSemanticDecorationLanguages.has(model.getLanguageId()) &&
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
    (delayMs = 175) => {
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
      gitDecorationsRef.current?.clear();
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
      navigationDecorationsRef.current ??=
        editor.createDecorationsCollection();
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
    const editor = editorRef.current;
    if (loading) return;

    if (!editor || !folderPath || !gitChange) {
      gitDecorationsRef.current?.clear();
      return;
    }

    let cancelled = false;
    const loadGitDecorations = async () => {
      try {
        const diffResult = await window.axon.getGitDiff(
          folderPath,
          filePath,
          gitChange.staged && !gitChange.unstaged,
          gitChange.indexState === "untracked",
        );
        if (cancelled) return;

        const model = editor.getModel();
        if (!model || model.isDisposed()) return;

        const lineDecorations = parseGitDiffLineDecorations(
          diffResult.diff,
          model.getLineCount(),
        );

        gitDecorationsRef.current ??= editor.createDecorationsCollection();
        gitDecorationsRef.current.set(
          lineDecorations.map((decoration) => ({
            range: new monaco.Range(
              decoration.lineNumber,
              1,
              decoration.lineNumber,
              1,
            ),
            options: {
              isWholeLine: true,
              className: `axon-git-line axon-git-line--${decoration.kind}`,
              linesDecorationsClassName: `axon-git-gutter axon-git-gutter--${decoration.kind}`,
              glyphMarginClassName: `axon-git-glyph axon-git-glyph--${decoration.kind}`,
              overviewRuler: {
                color:
                  decoration.kind === "added"
                    ? "#7ee787"
                    : decoration.kind === "modified"
                      ? "#f2cc60"
                      : "#ff7b72",
                position: monaco.editor.OverviewRulerLane.Left,
              },
            },
          })),
        );
      } catch (err) {
        console.error("failed to load git editor decorations:", err);
        gitDecorationsRef.current?.clear();
      }
    };

    void loadGitDecorations();

    return () => {
      cancelled = true;
    };
  }, [
    filePath,
    folderPath,
    gitChange?.absolutePath,
    gitChange?.indexState,
    gitChange?.staged,
    gitChange?.unstaged,
    gitChange?.worktreeState,
    editorReadyNonce,
    loading,
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

  useEditorActions({
    editorRef,
    filePath,
    jumpToDefinition,
    setTokenInspectorReport,
    themeSyntax,
    themeTokens,
    visible,
  });

  useEffect(() => {
    let cancelled = false;
    let acquiredModel = false;

    setLoading(true);
    setError(null);
    setPreviewMode("editor");

    readFile(filePath)
      .then((fc) => {
        if (cancelled) return;

        setLiveContent(fc.content);
        diskContentRef.current = fc.content;
        const model = acquireModel(filePath, fc.content);
        acquiredModel = true;

        // I attach the shared model only after this editor has acquired its
        // own reference. That keeps the model lifetime tied to real mounted
        // editors instead of to a read that may have resolved after the tab was
        // already closed.
        if (editorRef.current && !model.isDisposed()) {
          editorRef.current.setModel(model);
          window.requestAnimationFrame(() => {
            void refreshSemanticTokenDecorations();
            refreshGoSyntaxDecorations();
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const cleanup = window.axon.onFileChanged(({ path, content }) => {
      if (path !== filePathRef.current) return;
      setLiveContent(content);
      diskContentRef.current = content;
      updateModel(filePath, content);
      window.requestAnimationFrame(() => {
        void refreshSemanticTokenDecorations();
        refreshGoSyntaxDecorations();
      });
      onDirtyChange(filePath, false);
    });

    return () => {
      cancelled = true;
      navigationDecorationsRef.current?.clear();
      navigationDecorationsRef.current = null;
      gitDecorationsRef.current?.clear();
      gitDecorationsRef.current = null;
      semanticDecorationsRef.current?.clear();
      semanticDecorationsRef.current = null;
      goSyntaxDecorationsRef.current?.clear();
      goSyntaxDecorationsRef.current = null;
      editorOpenerRef.current?.dispose();
      editorOpenerRef.current = null;
      cleanup();
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
      // Release only if the async read reached acquireModel. Closing a split
      // quickly used to run this cleanup before the second editor acquired its
      // reference, which could decrement the first pane's shared model and
      // leave that still-open pane blank after Monaco disposed it.
      if (acquiredModel) releaseModel(filePath);
    };
  }, [filePath]);

  useActiveFileServices({ filePath, loading, syncDocument: syncDocumentWithLanguageServer, visible });

  const handleSave = useCallback(async () => {
    const path = filePathRef.current;
    if (!path || saving) return;
    const editor = editorRef.current;
    if (!editor || editor.getModel()?.isDisposed()) return;
    setSaving(true);
    try {
      const languageId = detectLanguageServerLanguage(path);
      if (
        editorSettings.formatOnSave &&
        folderPath &&
        editor &&
        languageId !== "plaintext"
      ) {
        try {
          const model = editor.getModel();
          const modelOptions = model?.getOptions();
          // Formatting edits are computed against the exact text snapshot we
          // send to the language server. If the user keeps typing while the IPC
          // and LSP round trip is in flight, those returned line/column ranges
          // no longer point at the same code in the live Monaco model. Capturing
          // the model version here lets us discard stale edits instead of
          // applying them to the wrong text and corrupting the file.
          const versionBeforeFormat = model?.getVersionId();
          const result = await window.axon.formatLanguageServerDocument({
            folderPath,
            filePath: path,
            languageId,
            content: editor.getValue(),
            tabSize: modelOptions?.tabSize ?? 2,
            insertSpaces: modelOptions?.insertSpaces ?? true,
          });

          const versionAfterFormat = model?.getVersionId();
          const modelChangedDuringFormat =
            !model ||
            model.isDisposed() ||
            versionBeforeFormat === undefined ||
            versionAfterFormat === undefined ||
            versionBeforeFormat !== versionAfterFormat;

          if (result.ok && result.edits.length > 0 && !modelChangedDuringFormat) {
            const viewStateBeforeFormat = editor.saveViewState();
            // I format the Monaco model before writing to disk so every split
            // attached to this shared model updates immediately. Writing a
            // formatted string directly would save the file but leave the
            // visible editor stale until another refresh happens.
            model?.pushEditOperations(
              [],
              result.edits.map(toMonacoEdit),
              () => null,
            );
            // Formatting can apply edits far away from the viewport. Monaco may
            // reveal the last touched range after those edits, which makes save
            // feel like it scrolled to the bottom of the file. Restoring the
            // pre-format view state keeps save non-navigational: the user's
            // cursor and viewport stay where they were before formatting ran.
            if (viewStateBeforeFormat && !model?.isDisposed()) {
              editor.restoreViewState(viewStateBeforeFormat);
            }
          } else if (
            result.ok &&
            result.edits.length > 0 &&
            modelChangedDuringFormat
          ) {
            // Skipping formatting here is intentional. The save below still
            // writes the user's latest text to disk, and the next save can
            // format a fresh snapshot. Applying stale ranges would be worse
            // because it can delete or overwrite code typed during the format
            // request.
            console.warn(
              "skipped format-on-save edits: model changed during LSP round trip",
            );
          }
        } catch (err) {
          console.error("format on save failed:", err);
        }
      }

      const currentContent = editor.getValue();
      await writeFile(path, currentContent, folderPath ?? path);
      diskContentRef.current = currentContent;
      onDirtyChange(path, false);
      window.dispatchEvent(
        new CustomEvent("axon:fileSaved", { detail: { path } }),
      );
    } catch (err: any) {
      console.error("save failed:", err.message);
    } finally {
      setSaving(false);
    }
  }, [editorSettings.formatOnSave, folderPath, onDirtyChange, saving]);

  useEffect(() => {
    const handleMenuSave = (event: Event) => {
      const saveEvent = event as CustomEvent<{ path?: string }>;
      if (saveEvent.detail?.path !== filePathRef.current) return;
      if (!visible) return;
      void handleSave();
    };

    window.addEventListener("axon:saveFile", handleMenuSave);
    return () => window.removeEventListener("axon:saveFile", handleMenuSave);
  }, [handleSave, visible]);

  useEffect(() => {
    const handleExternalSave = (event: Event) => {
      const saveEvent = event as CustomEvent<{ path?: string }>;
      if (saveEvent.detail?.path !== filePathRef.current) return;

      // App-level save writes the shared Monaco model directly so Cmd/Ctrl+S
      // still works when focus is outside this editor widget. This mounted
      // editor still owns the dirty comparison baseline, so I refresh it here
      // after any successful external save. Without this, a file could look
      // clean immediately after saving and then become dirty again on the next
      // edit because the editor was still comparing against the old disk text.
      diskContentRef.current = editorRef.current?.getValue() ?? "";
      onDirtyChange(filePathRef.current, false);
    };

    window.addEventListener("axon:fileSaved", handleExternalSave);
    return () =>
      window.removeEventListener("axon:fileSaved", handleExternalSave);
  }, [onDirtyChange]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    setEditorReadyNonce((nonce) => nonce + 1);
    markEditorMounted(filePath);

    registerAxonTheme(monaco, editorSettings.themeId, themeTokens, [], themeSyntax);
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

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      handleSave(),
    );
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
      const current = editor.getValue();
      // Monaco owns the live text; React only needs a snapshot for secondary
      // state on every keystroke wastes a render and reparses file symbols while
      // the user is still typing. A short trailing update keeps those secondary
      scheduleLiveContentUpdate(
        () => setLiveContent(current),
        isMd && previewMode === "split" ? 80 : 240,
      );
      onDirtyChange(filePath, current !== diskContentRef.current);
      syncDocumentWithLanguageServer(current);
      scheduleSemanticTokenDecorations();
      scheduleGoSyntaxUpdate(refreshGoSyntaxDecorations, 320);

      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;

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
      if (currentWord.length === 0 && !event.changes.some((change) => change.text.includes("<"))) {
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

  const breadcrumbSegments = useMemo(
    () => normalizePath(filePath).split("/").filter(Boolean).slice(-4),
    [filePath],
  );
  const breadcrumbSymbols = useMemo(
    () => collectFileSymbols(liveContent),
    [liveContent],
  );
  const activeBreadcrumbSymbol = [...breadcrumbSymbols]
    .reverse()
    .find((symbol) => symbol.line <= cursorPosition.line);

  if (error) {
    const fileName = filePath.split("/").pop() ?? filePath;

    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--axon-editor-background)] px-6">
        <div className="w-full max-w-sm rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.28)]">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]">
              <FileWarning size={17} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
                {fileName}
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-60">
                {error}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const breadcrumbNode = editorSettings.breadcrumbsEnabled ? (
    <EditorBreadcrumbs
      activeSymbol={activeBreadcrumbSymbol}
      breadcrumbSegments={breadcrumbSegments}
      filePath={filePath}
      open={bufferSymbolsOpen}
      symbols={breadcrumbSymbols}
      onSelectSymbol={jumpToBufferSymbol}
      onToggleOpen={() => setBufferSymbolsOpen((open) => !open)}
      onClose={() => setBufferSymbolsOpen(false)}
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
        saving={saving}
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
        <div className="flex items-center justify-end gap-1 border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-3 py-1">
          <Tooltip label="Editor" side="bottom">
            <button
              onClick={() => setPreviewMode("editor")}
              aria-label="Editor"
              className={`cursor-pointer rounded p-1 transition-colors ${
                previewMode === "editor"
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              }`}
            >
              <FileText size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Split preview" side="bottom">
            <button
              onClick={() => setPreviewMode("split")}
              aria-label="Split preview"
              className={`cursor-pointer rounded p-1 transition-colors ${
                previewMode === "split"
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              }`}
            >
              <Columns2 size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Preview" side="bottom">
            <button
              onClick={() => onOpenMarkdownPreviewTab?.(filePath)}
              aria-label="Preview"
              className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            >
              <Eye size={13} />
            </button>
          </Tooltip>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {previewMode === "editor" && editorNode}
        {previewMode === "split" && (
          <>
            {editorNode}
            <div className="w-px shrink-0 bg-[var(--axon-panel-border)]" />
            <div className="flex-1 overflow-hidden min-w-0">
              <MarkdownPreview
                content={liveContent}
                filePath={filePath}
                folderPath={folderPath}
                onOpenFile={onOpenFile}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
