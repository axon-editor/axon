import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { type EditorSettings } from "../../../shared/settings";
import { readFile } from "../../shared/lib/api";
import { getModel } from "../editor/lib/monacoModels";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import Tooltip from "../../shared/components/Tooltip";
import GitDiffEditorView from "./GitDiffEditorView";

interface Props {
  filePath: string;
  folderPath: string | null;
  editorSettings: EditorSettings;
  themeTokens: ResolvedThemeTokens;
  onClose: () => void;
}

export default function DiffModal({
  filePath,
  folderPath,
  editorSettings,
  themeTokens,
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
    let modelDisposable: { dispose: () => void } | null = null;
    setLoading(true);
    setError(null);

    const currentModel = getModel(filePath);
    if (currentModel) {
      setCurrentContent(currentModel.getValue());

      // The compare modal is meant to show "Git base vs the editor buffer",
      // not only "Git base vs whatever was on disk when the modal opened".
      // Monaco keeps unsaved edits in its model, so I subscribe directly to
      // that model while the modal is mounted. Without this listener, the user
      // has to close/reopen the compare view before fresh edits appear, which
      // makes the diff feel stale even though the editor already has the data.
      modelDisposable = currentModel.onDidChangeContent(() => {
        if (!cancelled) setCurrentContent(currentModel.getValue());
      });
    } else {
      setCurrentContent("");
    }

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
      modelDisposable?.dispose();
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
          <GitDiffEditorView
            filePath={filePath}
            original={baseContent}
            modified={currentContent}
            editorSettings={editorSettings}
            themeTokens={themeTokens}
          />
        )}
      </div>
    </div>
  );
}
