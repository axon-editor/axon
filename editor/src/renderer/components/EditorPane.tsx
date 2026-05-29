// Renders a Monaco editor instance per open file.
// All editors stay mounted simultaneously, only the active one is visible.
// This preserves scroll position, undo history, and cursor position per file
// across tab switches without remounting Monaco each time.
// For markdown files a preview toggle renders a side by side view
// using react-markdown with remark-gfm for GFM support.
import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readFile, writeFile } from "../lib/api";
import { Columns2, FileText, Eye } from "lucide-react";

interface Props {
  activeFile: string | null;
  openTabs: string[];
  onDirtyChange: (path: string, dirty: boolean) => void;
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    go: "go",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
  };
  return map[ext ?? ""] ?? "plaintext";
}

function isMarkdown(path: string): boolean {
  return path.split(".").pop()?.toLowerCase() === "md";
}

// MarkdownPreview renders markdown content with GFM support.
// Styled to match the dark editor theme.
function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="h-full overflow-y-auto px-10 py-8 bg-[#1e1e1e]">
      <div
        className="prose prose-invert prose-sm max-w-3xl mx-auto
        prose-headings:text-white prose-headings:font-semibold
        prose-p:text-neutral-300 prose-p:leading-relaxed
        prose-a:text-[#6c5ce7] prose-a:no-underline hover:prose-a:underline
        prose-code:text-[#6c5ce7] prose-code:bg-[#2a2a2a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px]
        prose-pre:bg-[#111111] prose-pre:border prose-pre:border-[#2a2a2a]
        prose-blockquote:border-l-[#6c5ce7] prose-blockquote:text-neutral-400
        prose-strong:text-white
        prose-li:text-neutral-300
        prose-hr:border-[#2a2a2a]
        prose-th:text-white prose-td:text-neutral-300
        prose-img:rounded-lg"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

// previewMode controls how markdown files are displayed.
// "editor" = editor only, "preview" = preview only, "split" = side by side
type PreviewMode = "editor" | "preview" | "split";

function SingleEditor({
  filePath,
  visible,
  onDirtyChange,
}: {
  filePath: string;
  visible: boolean;
  onDirtyChange: (path: string, dirty: boolean) => void;
}) {
  const [diskContent, setDiskContent] = useState("");
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
    setLoading(true);
    setError(null);
    setPreviewMode("editor");

    readFile(filePath)
      .then((fc) => {
        setDiskContent(fc.content);
        setLiveContent(fc.content);
        diskContentRef.current = fc.content;
        if (editorRef.current) {
          editorRef.current.setValue(fc.content);
        }
        window.axon.watchFile(filePath);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    const cleanup = window.axon.onFileChanged(({ path, content }) => {
      if (path !== filePathRef.current) return;
      setDiskContent(content);
      setLiveContent(content);
      diskContentRef.current = content;
      if (editorRef.current) {
        const pos = editorRef.current.getPosition();
        editorRef.current.setValue(content);
        if (pos) editorRef.current.setPosition(pos);
      }
      onDirtyChange(filePath, false);
    });

    return () => {
      cleanup();
      window.axon.unwatchFile();
    };
  }, [filePath]);

  const handleSave = async () => {
    const path = filePathRef.current;
    if (!path || saving) return;
    const currentContent = editorRef.current?.getValue() ?? "";
    setSaving(true);
    try {
      await writeFile(path, currentContent);
      setDiskContent(currentContent);
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      handleSave(),
    );
    editor.onDidChangeModelContent(() => {
      const current = editor.getValue();
      setLiveContent(current);
      onDirtyChange(filePath, current !== diskContentRef.current);
    });
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-neutral-600 text-[13px]">
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
        <div className="absolute top-2 right-4 text-[11px] text-neutral-500 z-10">
          saving...
        </div>
      )}
      <Editor
        height="100%"
        language={detectLanguage(filePath)}
        defaultValue={diskContent}
        theme="vs-dark"
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
          cursorBlinking: "smooth",
          smoothScrolling: true,
        }}
      />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col">
      {isMd && (
        <div className="flex items-center justify-end gap-1 px-3 py-1 bg-[#0d0d0d] border-b border-[#1f1f1f]">
          <button
            onClick={() => setPreviewMode("editor")}
            title="Editor only"
            className={`p-1 rounded transition-colors cursor-pointer
              ${
                previewMode === "editor"
                  ? "text-white bg-[#1e1e1e]"
                  : "text-neutral-500 hover:text-white"
              }`}
          >
            <FileText size={13} />
          </button>
          <button
            onClick={() => setPreviewMode("split")}
            title="Split view"
            className={`p-1 rounded transition-colors cursor-pointer
              ${
                previewMode === "split"
                  ? "text-white bg-[#1e1e1e]"
                  : "text-neutral-500 hover:text-white"
              }`}
          >
            <Columns2 size={13} />
          </button>
          <button
            onClick={() => setPreviewMode("preview")}
            title="Preview only"
            className={`p-1 rounded transition-colors cursor-pointer
              ${
                previewMode === "preview"
                  ? "text-white bg-[#1e1e1e]"
                  : "text-neutral-500 hover:text-white"
              }`}
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
            <div className="w-px bg-[#1f1f1f] shrink-0" />
            <div className="flex-1 overflow-hidden min-w-0">
              <MarkdownPreview content={liveContent} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function EditorPane({
  activeFile,
  openTabs,
  onDirtyChange,
}: Props) {
  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-600">
        <span className="text-4xl">⌥</span>
        <span className="text-[13px]">open a folder and select a file</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      {openTabs.map((path) => (
        <div
          key={path}
          className="absolute inset-0"
          style={{
            display: path === activeFile ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <SingleEditor
            filePath={path}
            visible={path === activeFile}
            onDirtyChange={onDirtyChange}
          />
        </div>
      ))}
    </div>
  );
}
