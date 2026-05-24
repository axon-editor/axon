// Renders the Monaco editor for the active file.
// Uses defaultValue + editor ref instead of controlled value prop so Monaco
// owns the content internally, avoiding re-render flicker and cursor jumps.
// Watches the active file for external changes via the IPC file watcher
// and updates the editor content when another editor modifies the file on disk.
// Save reads directly from the Monaco model via editorRef so there is
// no stale closure risk.
import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { readFile, writeFile } from "../lib/api";

interface Props {
  activeFile: string | null;
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

export default function EditorPane({ activeFile, onDirtyChange }: Props) {
  const [diskContent, setDiskContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const diskContentRef = useRef<string>("");

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    diskContentRef.current = diskContent;
  }, [diskContent]);

  useEffect(() => {
    if (!activeFile) return;

    setLoading(true);
    setError(null);
    setIsDirty(false);

    readFile(activeFile)
      .then((fc) => {
        setDiskContent(fc.content);
        diskContentRef.current = fc.content;

        if (editorRef.current) {
          editorRef.current.setValue(fc.content);
        }

        // start watching the file for external changes
        window.axon.watchFile(activeFile);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // register listener for external file changes pushed from main process.
    // when another editor saves the file we get the new content and update
    // the Monaco model directly without losing cursor position.
    const cleanup = window.axon.onFileChanged(({ path, content }) => {
      if (path !== activeFileRef.current) return;

      setDiskContent(content);
      diskContentRef.current = content;

      if (editorRef.current) {
        const currentPosition = editorRef.current.getPosition();
        editorRef.current.setValue(content);

        // restore cursor position after update so it doesnt jump to top
        if (currentPosition) {
          editorRef.current.setPosition(currentPosition);
        }
      }

      setIsDirty(false);
    });

    return () => {
      cleanup();
      window.axon.unwatchFile();
    };
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile) return;
    onDirtyChange(activeFile, isDirty);
  }, [isDirty, activeFile]);

  const handleSave = async () => {
    const path = activeFileRef.current;
    if (!path || saving) return;

    const currentContent = editorRef.current?.getValue() ?? "";

    setSaving(true);
    try {
      await writeFile(path, currentContent);
      setDiskContent(currentContent);
      diskContentRef.current = currentContent;
      setIsDirty(false);
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
      setIsDirty(current !== diskContentRef.current);
    });
  };

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-600">
        <span className="text-4xl">⌥</span>
        <span className="text-[13px]">open a folder and select a file</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-[13px]">
        loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-[13px]">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      {saving && (
        <div className="absolute top-2 right-4 text-[11px] text-neutral-500 z-10">
          saving...
        </div>
      )}
      <Editor
        height="100%"
        language={detectLanguage(activeFile)}
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
