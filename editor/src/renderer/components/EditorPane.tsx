// Renders a Monaco editor instance per open file.
// All editors stay mounted simultaneously, only the active one is visible.
import { SingleEditor } from "./EditorPane/SingleEditor";

interface Props {
  activeFile: string | null;
  openTabs: string[];
  onDirtyChange: (path: string, dirty: boolean) => void;
  onCursorChange: (line: number, col: number) => void;
  onLanguageChange: (lang: string) => void;
}

export default function EditorPane({
  activeFile,
  openTabs,
  onDirtyChange,
  onCursorChange,
  onLanguageChange,
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
            onCursorChange={onCursorChange}
            onLanguageChange={onLanguageChange}
          />
        </div>
      ))}
    </div>
  );
}
