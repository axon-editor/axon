// Renders a Monaco editor instance per open file.
// All editors stay mounted simultaneously, only the active one is visible.
// This preserves scroll position, undo history, and cursor position per file
// across tab switches without remounting Monaco each time.
import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { readFile, writeFile } from "../lib/api";

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

// SingleEditor manages one Monaco instance for one file.
// It stays mounted as long as the file is in openTabs.
// visibility is controlled by the parent via the visible prop.
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diskContentRef = useRef("");
  const filePathRef = useRef(filePath);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    readFile(filePath)
      .then((fc) => {
        setDiskContent(fc.content);
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

  return (
    <div className="w-full h-full relative">
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
          style={{ display: path === activeFile ? "block" : "none" }}
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
