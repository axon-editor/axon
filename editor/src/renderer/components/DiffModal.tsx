import { useEffect, useMemo, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { X } from "lucide-react";
import { type EditorSettings } from "../../shared/settings";
import { readFile } from "../lib/api";
import { detectLanguage, getModel } from "../lib/monacoModels";
import { getMonacoThemeId, registerAxonTheme } from "../lib/soraTheme";
import Tooltip from "./Tooltip";

interface Props {
  filePath: string;
  folderPath: string | null;
  editorSettings: EditorSettings;
  onClose: () => void;
}

export default function DiffModal({
  filePath,
  folderPath,
  editorSettings,
  onClose,
}: Props) {
  const [baseContent, setBaseContent] = useState("");
  const [currentContent, setCurrentContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileName = useMemo(
    () => filePath.split("/").pop() ?? filePath,
    [filePath],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const currentModel = getModel(filePath);
    setCurrentContent(currentModel?.getValue() ?? "");

    const loadCurrentContent = readFile(filePath).then((file) => {
      if (!currentModel) setCurrentContent(file.content);
      return file.content;
    });

    const loadBaseContent = folderPath
      ? window.axon.getGitFileBase(folderPath, filePath)
      : readFile(filePath).then((file) => file.content);

    Promise.all([loadBaseContent, loadCurrentContent])
      .then(([base]) => {
        if (cancelled) return;
        setBaseContent(base);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, folderPath]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-6 py-6">
      <div className="flex h-full max-h-[860px] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[#222838] bg-[#0e1018] shadow-2xl">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#222838] px-3">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-white">
              {fileName}
            </div>
            <div className="truncate text-[10px] text-[#586478]">
              git base to current buffer
            </div>
          </div>

          <Tooltip label="Close diff" side="bottom">
            <button
              onClick={onClose}
              aria-label="Close diff"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
            >
              <X size={14} />
            </button>
          </Tooltip>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[#586478]">
            loading diff...
          </div>
        )}

        {error && (
          <div className="flex flex-1 items-center justify-center text-[13px] text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <DiffEditor
            height="100%"
            original={baseContent}
            modified={currentContent}
            language={detectLanguage(filePath)}
            theme={getMonacoThemeId(editorSettings.themeId)}
            beforeMount={(monacoInstance) =>
              registerAxonTheme(monacoInstance, editorSettings.themeId)
            }
            options={{
              readOnly: true,
              renderSideBySide: true,
              fontSize: editorSettings.fontSize,
              fontFamily: `'${editorSettings.fontFamily}', monospace`,
              lineHeight: editorSettings.lineHeight,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              originalEditable: false,
            }}
          />
        )}
      </div>
    </div>
  );
}
