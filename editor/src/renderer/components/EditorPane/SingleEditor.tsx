// Renders a Monaco editor instance for a single file.
// Uses shared Monaco models via monacoModels.ts so multiple panes
// showing the same file share one model and edits reflect instantly
// across all panes without saving.
import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Columns2, FileText, Eye } from "lucide-react";
import { type EditorSettings } from "../../../shared/settings";
import { readFile, writeFile } from "../../lib/api";
import { getMonacoThemeId, registerAxonTheme } from "../../lib/soraTheme";
import Tooltip from "../Tooltip";
import MarkdownPreview from "../MarkdownPreview";
import {
  updateModel,
  releaseModel,
  acquireModel,
  getModel,
} from "../../lib/monacoModels";

interface Props {
  filePath: string;
  folderPath: string | null;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
  editorSettings: EditorSettings;
}

function isMarkdown(path: string): boolean {
  return path.split(".").pop()?.toLowerCase() === "md";
}

type PreviewMode = "editor" | "preview" | "split";

export default function SingleEditor({
  filePath,
  folderPath,
  visible,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
  editorSettings,
}: Props) {
  const [liveContent, setLiveContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("editor");

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diskContentRef = useRef("");
  const filePathRef = useRef(filePath);
  const isMd = isMarkdown(filePath);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    if (visible) {
      onLanguageChange(filePath.split(".").pop()?.toLowerCase() ?? "plaintext");
      onCursorChange(1, 1);
      registerAxonTheme(monaco, editorSettings.themeId);
    }
  }, [visible, editorSettings.themeId]);

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
      cleanup();
      window.axon.unwatchFile();
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

    registerAxonTheme(monaco, editorSettings.themeId);

    // only attach model if it already exists from a previous readFile call
    // if readFile hasn't resolved yet it will call editor.setModel when it does
    const model = getModel(filePath);
    if (model && !model.isDisposed()) {
      editor.setModel(model);
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      handleSave(),
    );

    editor.onDidChangeModelContent(() => {
      const current = editor.getValue();
      setLiveContent(current);
      onDirtyChange(filePath, current !== diskContentRef.current);
    });

    editor.onDidChangeCursorPosition((e) => {
      if (visible) {
        onCursorChange(e.position.lineNumber, e.position.column);
      }
    });

    onLanguageChange(filePath.split(".").pop()?.toLowerCase() ?? "plaintext");
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#364050] text-[13px]">
        loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-500 text-[13px]">
        {error}
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
          registerAxonTheme(monacoInstance, editorSettings.themeId)
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
          fontFamily: `'${editorSettings.fontFamily}', monospace`,
          lineHeight: editorSettings.lineHeight,
          fontLigatures: editorSettings.fontLigatures,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "on",
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
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
