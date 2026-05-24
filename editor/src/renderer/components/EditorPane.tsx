// Renders the Monaco editor for the active file.
// When activeFile changes, fetches the file content from axon-core
// and loads it into Monaco. Detects language from file extension
// so syntax highlighting works correctly across file types.
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { readFile } from "../lib/api";

interface Props {
  activeFile: string | null;
}

// detectLanguage maps file extensions to Monaco language identifiers.
// Add more as needed when supporting more languages.
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

export default function EditorPane({ activeFile }: Props) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fetch file content from axon-core whenever the active file changes
  useEffect(() => {
    if (!activeFile) return;

    setLoading(true);
    setError(null);

    readFile(activeFile)
      .then((fc) => setContent(fc.content))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeFile]);

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
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={detectLanguage(activeFile)}
        value={content}
        theme="vs-dark"
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
