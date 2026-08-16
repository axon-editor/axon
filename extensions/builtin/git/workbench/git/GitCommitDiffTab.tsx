import { type EditorSettings } from "@axon-editor/shared/settings";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import GitHistoryEditor from "./GitHistoryEditor";
import { getGitCommitDiffTabData } from "./lib/gitGraphTab";

interface Props {
  editorSettings: EditorSettings;
  tabPath: string;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
  onClose: () => void;
}

export default function GitCommitDiffTab({
  editorSettings,
  tabPath,
  themeSyntax,
  themeTokens,
  onClose,
}: Props) {
  const data = getGitCommitDiffTabData(tabPath);

  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--axon-editor-background)] px-6 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
        This Git comparison is no longer available. Close the tab and open it
        again from Git Graph.
      </div>
    );
  }

  return (
    <GitHistoryEditor
      commit={data.commit}
      file={data.file}
      diff={data.diff}
      editorSettings={editorSettings}
      themeSyntax={themeSyntax}
      themeTokens={themeTokens}
      onClose={onClose}
    />
  );
}
