// Bottom status bar showing active file language, cursor position,
// encoding, and the Axon brand. All values are live from Monaco
// and update as the cursor moves or the active file changes.
import { FileCode } from "lucide-react";

interface Props {
  activeFile: string | null;
  language: string;
  cursor: { line: number; col: number };
}

export default function StatusBar({ activeFile, language, cursor }: Props) {
  return (
    <div className="h-6 bg-[#6c5ce7] flex items-center px-3 gap-4 text-[11px] text-white/90 shrink-0">
      <span className="font-semibold tracking-wide">Axon</span>
      <div className="ml-auto flex items-center gap-4">
        {activeFile && (
          <>
            <span className="flex items-center gap-1">
              <FileCode size={11} />
              {language}
            </span>
            <span>UTF-8</span>
            <span>
              Ln {cursor.line}, Col {cursor.col}
            </span>
          </>
        )}
        {!activeFile && <span className="text-white/50">no file open</span>}
      </div>
    </div>
  );
}
