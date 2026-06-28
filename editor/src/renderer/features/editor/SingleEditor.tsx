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
import { readFile, writeFile } from "../../shared/lib/api";
import { type EditorNavigationTarget } from "./lib/navigation";
import { registerAxonTheme } from "../../shared/lib/soraTheme";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import { parseGitDiffLineDecorations } from "../git/lib/gitDiffDecorations";
import Tooltip from "../../shared/components/Tooltip";
import MarkdownPreview from "../preview/MarkdownPreview";
import EditorBreadcrumbs from "./EditorBreadcrumbs";
import MonacoEditorSurface from "./MonacoEditorSurface";
import {
  updateModel,
  releaseModel,
  acquireModel,
  getModel,
  detectLanguage,
  detectLanguageServerLanguage,
} from "./lib/monacoModels";
import { collectFileSymbols } from "../sidebar/files/lib/fileSymbols";
import {
  encodeLocalPath,
  goCallExclusions,
  isMarkdown,
  normalizePath,
  toMonacoEdit,
} from "./lib/editorDocumentHelpers";

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
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
}

type PreviewMode = "editor" | "split";
type EditorActionRequest = "definition" | "references" | "rename" | "format";

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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [bufferSymbolsOpen, setBufferSymbolsOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suggestTimerRef = useRef<number | null>(null);
  const lspSyncTimerRef = useRef<number | null>(null);
  const navigationDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const gitDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const goSyntaxDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const findDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorOpenerRef = useRef<monaco.IDisposable | null>(null);
  const diskContentRef = useRef("");
  const filePathRef = useRef(filePath);
  const isMd = isMarkdown(filePath);
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

  const updateFindDecorations = useCallback(
    (query: string, nextIndex = findIndex) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model || !query.trim()) {
        findDecorationsRef.current?.clear();
        setFindMatchCount(0);
        setFindIndex(0);
        return;
      }

      const matches = model.findMatches(
        query,
        true,
        false,
        false,
        null,
        true,
      );
      setFindMatchCount(matches.length);
      if (matches.length === 0) {
        findDecorationsRef.current?.clear();
        setFindIndex(0);
        return;
      }

      const clampedIndex = Math.max(0, Math.min(nextIndex, matches.length - 1));
      setFindIndex(clampedIndex);
      findDecorationsRef.current ??= editor.createDecorationsCollection();
      findDecorationsRef.current.set(
        matches.map((match, index) => ({
          range: match.range,
          options: {
            className:
              index === clampedIndex
                ? "axon-find-match axon-find-match--active"
                : "axon-find-match",
            inlineClassName:
              index === clampedIndex
                ? "axon-find-match-inline axon-find-match-inline--active"
                : "axon-find-match-inline",
          },
        })),
      );
      editor.setSelection(matches[clampedIndex].range);
      editor.revealRangeInCenter(
        matches[clampedIndex].range,
        monaco.editor.ScrollType.Smooth,
      );
    },
    [findIndex],
  );

  const openFind = useCallback(() => {
    setPreviewMode("editor");
    setFindOpen(true);
    window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    findDecorationsRef.current?.clear();
    editorRef.current?.focus();
  }, []);

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

  const moveFindSelection = useCallback(
    (direction: 1 | -1) => {
      if (findMatchCount === 0) return;
      setFindIndex(
        (index) => (index + direction + findMatchCount) % findMatchCount,
      );
    },
    [findMatchCount],
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
      }, 180);
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

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

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
      registerAxonTheme(monaco, editorSettings.themeId, themeTokens);
      refreshGoSyntaxDecorations();
    }
  }, [
    visible,
    editorSettings.themeId,
    themeTokens,
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

  useEffect(() => {
    if (!findOpen) {
      findDecorationsRef.current?.clear();
      return;
    }

    updateFindDecorations(findQuery, findIndex);
  }, [findIndex, findOpen, findQuery, liveContent, updateFindDecorations]);

  useEffect(() => {
    const handleEditorAction = (event: Event) => {
      const actionEvent = event as CustomEvent<{
        path?: string;
        action?: EditorActionRequest;
      }>;
      if (!visible || actionEvent.detail?.path !== filePath) return;

      const editor = editorRef.current;
      if (!editor) return;

      const action = actionEvent.detail.action ?? "definition";
      if (action === "definition") {
        void jumpToDefinition().then((jumped) => {
          if (!jumped) {
            void editor.getAction("editor.action.revealDefinition")?.run();
          }
        });
        return;
      }

      // Monaco owns the final UI for reference search, rename inputs, and
      // formatter edits. Definition is handled above because Monaco may stop at
      // a peek popup before Axon's tab model has loaded the target file.
      const actionIdByRequest: Record<Exclude<EditorActionRequest, "definition">, string> = {
        references: "editor.action.referenceSearch.trigger",
        rename: "editor.action.rename",
        format: "editor.action.formatDocument",
      };
      const actionId = actionIdByRequest[action];

      void editor.getAction(actionId)?.run();
    };

    window.addEventListener("axon:editorAction", handleEditorAction);
    return () =>
      window.removeEventListener("axon:editorAction", handleEditorAction);
  }, [filePath, jumpToDefinition, visible]);

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
          window.requestAnimationFrame(refreshGoSyntaxDecorations);
        }
        syncDocumentWithLanguageServer(fc.content);

        window.axon.watchFile(filePath);
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
      window.requestAnimationFrame(refreshGoSyntaxDecorations);
      onDirtyChange(filePath, false);
    });

    return () => {
      cancelled = true;
      navigationDecorationsRef.current?.clear();
      navigationDecorationsRef.current = null;
      gitDecorationsRef.current?.clear();
      gitDecorationsRef.current = null;
      goSyntaxDecorationsRef.current?.clear();
      goSyntaxDecorationsRef.current = null;
      editorOpenerRef.current?.dispose();
      editorOpenerRef.current = null;
      cleanup();
      window.axon.unwatchFile();
      if (suggestTimerRef.current) {
        window.clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      if (lspSyncTimerRef.current) {
        window.clearTimeout(lspSyncTimerRef.current);
        lspSyncTimerRef.current = null;
      }
      // Release only if the async read reached acquireModel. Closing a split
      // quickly used to run this cleanup before the second editor acquired its
      // reference, which could decrement the first pane's shared model and
      // leave that still-open pane blank after Monaco disposed it.
      if (acquiredModel) releaseModel(filePath);
    };
  }, [filePath]);

  const handleSave = useCallback(async () => {
    const path = filePathRef.current;
    if (!path || saving) return;
    const editor = editorRef.current;
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
          const result = await window.axon.formatLanguageServerDocument({
            folderPath,
            filePath: path,
            languageId,
            content: editor.getValue(),
            tabSize: modelOptions?.tabSize ?? 2,
            insertSpaces: modelOptions?.insertSpaces ?? true,
          });

          if (result.ok && result.edits.length > 0) {
            // I format the Monaco model before writing to disk so every split
            // attached to this shared model updates immediately. Writing a
            // formatted string directly would save the file but leave the
            // visible editor stale until another refresh happens.
            model?.pushEditOperations(
              [],
              result.edits.map(toMonacoEdit),
              () => null,
            );
          }
        } catch (err) {
          console.error("format on save failed:", err);
        }
      }

      const currentContent = editor?.getValue() ?? "";
      await writeFile(path, currentContent);
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
      void handleSave();
    };

    window.addEventListener("axon:saveFile", handleMenuSave);
    return () => window.removeEventListener("axon:saveFile", handleMenuSave);
  }, [handleSave]);

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

    registerAxonTheme(monaco, editorSettings.themeId, themeTokens);

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

    editor.onDidChangeModelContent((event) => {
      const current = editor.getValue();
      setLiveContent(current);
      onDirtyChange(filePath, current !== diskContentRef.current);
      syncDocumentWithLanguageServer(current);
      refreshGoSyntaxDecorations();

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
        languageId === "typescript";

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

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--axon-editor-background)] text-[13px] text-[var(--axon-editor-foreground)] opacity-35">
        loading...
      </div>
    );
  }

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
      onJumpToSymbol={jumpToBreadcrumbSymbol}
      onSelectSymbol={jumpToBufferSymbol}
      onToggleOpen={() => setBufferSymbolsOpen((open) => !open)}
      onClose={() => setBufferSymbolsOpen(false)}
    />
  ) : null;

  const editorNode = (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
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
        themeTokens={themeTokens}
        onChangeFindQuery={(query) => {
          setFindQuery(query);
          setFindIndex(0);
        }}
        onCloseFind={closeFind}
        onMount={handleEditorMount}
        onMoveFindSelection={moveFindSelection}
      />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col">
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
