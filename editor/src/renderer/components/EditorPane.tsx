import Editor from "@monaco-editor/react";

interface Props {
  activeFile: string | null;
}

export default function EditorPane({ activeFile }: Props) {
  return (
    <div className="flex-1 overflow-hidden">
      {activeFile ? (
        <Editor
          height="100%"
          defaultLanguage="go"
          defaultValue={`// ${activeFile}\npackage main\n`}
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
      ) : (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-neutral-600">
          <span className="text-4xl">⌥</span>
          <span className="text-[13px]">select a file to start editing</span>
        </div>
      )}
    </div>
  );
}
