// Renders a Monaco editor instance for a single file.
// Uses shared Monaco models via monacoModels.ts so multiple panes
// showing the same file share one model and edits reflect instantly
// across all panes without saving.
import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Columns2, FileWarning, FileText, Eye } from "lucide-react";
import { type EditorSettings } from "../../../shared/settings";
import { editorFontStack } from "../../lib/fonts";
import { type GitChange } from "../../../shared/git";
import { readFile, writeFile } from "../../lib/api";
import { type EditorNavigationTarget } from "../../lib/navigation";
import { getMonacoThemeId, registerAxonTheme } from "../../lib/soraTheme";
import { type ResolvedThemeTokens } from "../../lib/themeTokens";
import { parseGitDiffLineDecorations } from "../../lib/gitDiffDecorations";
import Tooltip from "../Tooltip";
import MarkdownPreview from "../MarkdownPreview";
import {
  updateModel,
  releaseModel,
  acquireModel,
  getModel,
  detectLanguage,
} from "../../lib/monacoModels";

interface Props {
  filePath: string;
  folderPath: string | null;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onOpenFile?: (path: string) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
  themeTokens: ResolvedThemeTokens;
  navigationTarget: EditorNavigationTarget | null;
  gitChanges?: GitChange[];
}

function isMarkdown(path: string): boolean {
  return path.split(".").pop()?.toLowerCase() === "md";
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

type PreviewMode = "editor" | "preview" | "split";
type EditorActionRequest = "definition" | "references";

export default function SingleEditor({
  filePath,
  folderPath,
  visible,
  onDirtyChange,
  onOpenFile,
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

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suggestTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const lspSyncTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const navigationDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const gitDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const diskContentRef = useRef("");
  const filePathRef = useRef(filePath);
  const isMd = isMarkdown(filePath);
  const gitChange = gitChanges?.find(
    (change) => normalizePath(change.absolutePath) === normalizePath(filePath),
  );

  const syncDocumentWithLanguageServer = useCallback(
    (content: string) => {
      if (!folderPath) return;
      const languageId = detectLanguage(filePathRef.current);
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
    }
  }, [visible, editorSettings.themeId, themeTokens]);

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
    const handleEditorAction = (event: Event) => {
      const actionEvent = event as CustomEvent<{
        path?: string;
        action?: EditorActionRequest;
      }>;
      if (!visible || actionEvent.detail?.path !== filePath) return;

      const editor = editorRef.current;
      if (!editor) return;

      // Monaco already owns the language-feature UI for definitions and
      // references. Triggering its built-in actions here keeps Axon's command
      // palette and shortcuts thin while still leaving room for a future LSP
      // client to register richer providers behind the same editor actions.
      const actionId =
        actionEvent.detail.action === "references"
          ? "editor.action.referenceSearch.trigger"
          : "editor.action.revealDefinition";

      void editor.getAction(actionId)?.run();
    };

    window.addEventListener("axon:editorAction", handleEditorAction);
    return () =>
      window.removeEventListener("axon:editorAction", handleEditorAction);
  }, [filePath, visible]);

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
      onDirtyChange(filePath, false);
    });

    return () => {
      cancelled = true;
      navigationDecorationsRef.current?.clear();
      navigationDecorationsRef.current = null;
      gitDecorationsRef.current?.clear();
      gitDecorationsRef.current = null;
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
    const currentContent = editorRef.current?.getValue() ?? "";
    setSaving(true);
    try {
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
  }, [onDirtyChange, saving]);

  useEffect(() => {
    const handleMenuSave = (event: Event) => {
      const saveEvent = event as CustomEvent<{ path?: string }>;
      if (saveEvent.detail?.path !== filePathRef.current) return;
      void handleSave();
    };

    window.addEventListener("axon:saveFile", handleMenuSave);
    return () => window.removeEventListener("axon:saveFile", handleMenuSave);
  }, [handleSave]);

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

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      handleSave(),
    );

    editor.onDidChangeModelContent((event) => {
      const current = editor.getValue();
      setLiveContent(current);
      onDirtyChange(filePath, current !== diskContentRef.current);
      syncDocumentWithLanguageServer(current);

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
      if (visible) {
        onCursorChange(e.position.lineNumber, e.position.column);
      }
    });

    onLanguageChange(detectLanguage(filePath));
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#364050] text-[13px]">
        loading...
      </div>
    );
  }

  if (error) {
    const fileName = filePath.split("/").pop() ?? filePath;

    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0e1018] px-6">
        <div className="max-w-sm w-full rounded-lg border border-[#222838] bg-[#11141d] px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.28)]">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md border border-[#2a3346] bg-[#171c28] flex items-center justify-center text-[#80c8e0] shrink-0">
              <FileWarning size={17} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-medium text-[#d7deea] truncate">
                {fileName}
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-[#8d98aa]">
                {error}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const editorNode = (
    <div className="h-full relative flex-1 min-w-0">
      {saving && (
        <div className="absolute top-2 right-4 text-[11px] text-[#586478] z-10">
          saving...
        </div>
      )}
      <Editor
        height="100%"
        theme={getMonacoThemeId(editorSettings.themeId)}
        beforeMount={(monacoInstance) =>
          registerAxonTheme(monacoInstance, editorSettings.themeId, themeTokens)
        }
        onMount={handleEditorMount}
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
          lineHeight: editorSettings.lineHeight,
          fontLigatures: editorSettings.fontLigatures,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          glyphMargin: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
          quickSuggestionsDelay: 0,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnCommitCharacter: true,
          snippetSuggestions: "top",
          suggest: {
            showSnippets: true,
            snippetsPreventQuickSuggestions: false,
          },
          tabCompletion: "on",
          renderLineHighlight: "line",
          padding: { top: 16 },
          cursorBlinking: "expand",
          smoothScrolling: true,
        }}
      />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col">
      {isMd && (
        <div className="flex items-center justify-end gap-1 px-3 py-1 bg-[#0a0c12] border-b border-[#222838]">
          <Tooltip label="Editor" side="bottom">
            <button
              onClick={() => setPreviewMode("editor")}
              aria-label="Editor"
              className={`p-1 rounded transition-colors cursor-pointer ${previewMode === "editor" ? "text-white bg-[#1e2430]" : "text-[#586478] hover:text-white"}`}
            >
              <FileText size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Split preview" side="bottom">
            <button
              onClick={() => setPreviewMode("split")}
              aria-label="Split preview"
              className={`p-1 rounded transition-colors cursor-pointer ${previewMode === "split" ? "text-white bg-[#1e2430]" : "text-[#586478] hover:text-white"}`}
            >
              <Columns2 size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Preview" side="bottom">
            <button
              onClick={() => setPreviewMode("preview")}
              aria-label="Preview"
              className={`p-1 rounded transition-colors cursor-pointer ${previewMode === "preview" ? "text-white bg-[#1e2430]" : "text-[#586478] hover:text-white"}`}
            >
              <Eye size={13} />
            </button>
          </Tooltip>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {previewMode === "editor" && editorNode}
        {previewMode === "preview" && (
          <div className="flex-1 overflow-hidden">
            <MarkdownPreview
              content={liveContent}
              filePath={filePath}
              folderPath={folderPath}
              onOpenFile={onOpenFile}
            />
          </div>
        )}
        {previewMode === "split" && (
          <>
            {editorNode}
            <div className="w-px bg-[#222838] shrink-0" />
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
