// Renders a Monaco editor instance for a single file.
// Uses shared Monaco models via monacoModels.ts so multiple panes
// showing the same file share one model and edits reflect instantly
// across all panes without saving.
import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Columns2, FileText, Eye } from "lucide-react";
import { readFile, writeFile } from "../../lib/api";
import { registerSoraTheme } from "../../lib/soraTheme";
import {
  getOrCreateModel,
  updateModel,
  releaseModel,
} from "../../lib/monacoModels";

interface Props {
  filePath: string;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
}

function isMarkdown(path: string): boolean {
  return path.split(".").pop()?.toLowerCase() === "md";
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="h-full overflow-y-auto px-10 py-8 bg-[#0e1018]">
      <div
        className="prose prose-invert prose-sm max-w-3xl mx-auto
        prose-headings:text-white prose-headings:font-semibold
        prose-p:text-[#c8d0e0] prose-p:leading-relaxed
        prose-a:text-[#80c8e0] prose-a:no-underline hover:prose-a:underline
        prose-code:text-[#80c8e0] prose-code:bg-[#14161e] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px]
        prose-pre:bg-[#0a0c12] prose-pre:border prose-pre:border-[#222838]
        prose-blockquote:border-l-[#80c8e0] prose-blockquote:text-[#9aa4b8]
        prose-strong:text-white
        prose-li:text-[#c8d0e0]
        prose-hr:border-[#222838]
        prose-th:text-white prose-td:text-[#c8d0e0]
        prose-img:rounded-lg"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

type PreviewMode = "editor" | "preview" | "split";

export default function SingleEditor({
  filePath,
  visible,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
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
    }
  }, [visible]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPreviewMode("editor");

    readFile(filePath)
      .then((fc) => {
        setLiveContent(fc.content);
        diskContentRef.current = fc.content;

        // get or create the shared model for this file
        const model = getOrCreateModel(filePath, fc.content);

        // if editor is already mounted attach the shared model
        if (editorRef.current) {
          editorRef.current.setModel(model);
        }

        window.axon.watchFile(filePath);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    const cleanup = window.axon.onFileChanged(({ path, content }) => {
      if (path !== filePathRef.current) return;
      setLiveContent(content);
      diskContentRef.current = content;

      // update the shared model so all panes see the change
      updateModel(filePath, content);
      onDirtyChange(filePath, false);
    });

    return () => {
      cleanup();
      window.axon.unwatchFile();
      // release our reference to the shared model
      releaseModel(filePath);
    };
  }, [filePath]);

  const handleSave = async () => {
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
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    const existingModel = getOrCreateModel(filePath, diskContentRef.current);
    editor.setModel(existingModel);

    registerSoraTheme();
    monaco.editor.setTheme("sora");

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      handleSave(),
    );

    // each editor instance registers its own content change listener
    // so each pane independently tracks dirty state against its own diskContentRef
    editor.onDidChangeModelContent(() => {
      const current = editor.getValue();
      setLiveContent(current);
      // compare against this instance's disk content ref
      // not a shared value so each pane tracks its own dirty state correctly
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
        theme="sora"
        onMount={handleEditorMount}
        options={{
          fontSize: 14,
          fontFamily: "'Fira Code', monospace",
          fontLigatures: true,
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
          <button
            onClick={() => setPreviewMode("editor")}
            className={`p-1 rounded transition-colors cursor-pointer ${previewMode === "editor" ? "text-white bg-[#1e2430]" : "text-[#586478] hover:text-white"}`}
          >
            <FileText size={13} />
          </button>
          <button
            onClick={() => setPreviewMode("split")}
            className={`p-1 rounded transition-colors cursor-pointer ${previewMode === "split" ? "text-white bg-[#1e2430]" : "text-[#586478] hover:text-white"}`}
          >
            <Columns2 size={13} />
          </button>
          <button
            onClick={() => setPreviewMode("preview")}
            className={`p-1 rounded transition-colors cursor-pointer ${previewMode === "preview" ? "text-white bg-[#1e2430]" : "text-[#586478] hover:text-white"}`}
          >
            <Eye size={13} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {previewMode === "editor" && editorNode}
        {previewMode === "preview" && (
          <div className="flex-1 overflow-hidden">
            <MarkdownPreview content={liveContent} />
          </div>
        )}
        {previewMode === "split" && (
          <>
            {editorNode}
            <div className="w-px bg-[#222838] shrink-0" />
            <div className="flex-1 overflow-hidden min-w-0">
              <MarkdownPreview content={liveContent} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
