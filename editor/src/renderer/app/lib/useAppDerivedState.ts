import { useMemo } from "react";
import { getWorkspaceTrustState } from "../../features/sidebar";
import { isDiagnosticInWorkspace } from "../../features/diagnostics/lib/diagnosticCache";
import { getModel } from "../../features/editor/lib/monacoModels";
import { collectFileSymbols } from "../../features/sidebar/files/lib/fileSymbols";
import { createThemeCssVariables, resolveThemeTokens } from "../../shared/lib/themeTokens";
import type { FileSymbol } from "../../features/sidebar/files/lib/fileSymbols";

function colorWithAlpha(color: string, alpha: number) {
  const normalizedColor = color.trim();
  const match = normalizedColor.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i,
  );
  if (!match) return color;

  const [, red, green, blue, existingAlpha] = match;
  const baseAlpha = existingAlpha
    ? Number.parseInt(existingAlpha, 16) / 255
    : 1;
  const finalAlpha = Math.max(0, Math.min(1, alpha * baseAlpha));
  return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${finalAlpha})`;
}

interface AppDerivedStateOptions {
  extensionState: any;
  folderPath: string | null;
  gitStatus: any;
  layout: any;
  lspDiagnosticsByFile: any;
  monacoDiagnostics: any[];
  projectDiagnostics: any[];
  settings: any;
  workspaceTrustNonce: number;
}

export function useAppDerivedState({
  extensionState,
  folderPath,
  gitStatus,
  layout,
  lspDiagnosticsByFile,
  monacoDiagnostics,
  projectDiagnostics,
  settings,
  workspaceTrustNonce,
}: AppDerivedStateOptions) {
  const activePane = layout.panes.find((p: any) => p.id === layout.activePaneId);
  const workspaceTrusted = useMemo(
    () => getWorkspaceTrustState(folderPath) !== false,
    [folderPath, workspaceTrustNonce],
  );


  const extensionThemes = useMemo(
    () =>
      extensionState?.extensions.flatMap((extension: any) =>
        extension.enabled ? extension.themes : [],
      ) ?? [],
    [extensionState],
  );
  const themeTokens = useMemo(
    () => resolveThemeTokens(settings, extensionThemes),
    [extensionThemes, settings],
  );
  const themeCssVariables = useMemo(
    () => createThemeCssVariables(themeTokens),
    [themeTokens],
  );
  const appThemeCssVariables = useMemo(() => {
    if (!settings.editor.appTransparency) return themeCssVariables;

    const opacity = settings.editor.appBackgroundOpacity;

    // Electron's transparent BrowserWindow gives Axon a real transparent
    // native canvas, but the renderer still decides which surfaces participate
    // in that transparency. I only soften large background surfaces here so
    // text, icons, syntax tokens, and controls stay fully opaque and readable.
    return {
      ...themeCssVariables,
      "--axon-background": colorWithAlpha(themeTokens.background, opacity),
      "--axon-title-bar-background": colorWithAlpha(
        themeTokens["title_bar.background"],
        opacity,
      ),
      "--axon-toolbar-background": colorWithAlpha(
        themeTokens["toolbar.background"],
        opacity,
      ),
      "--axon-sidebar-background": colorWithAlpha(
        themeTokens["sidebar.background"],
        opacity,
      ),
      "--axon-sidebar-border": colorWithAlpha(
        themeTokens["sidebar.border"],
        Math.min(1, opacity + 0.25),
      ),
      "--axon-tab-active-background": colorWithAlpha(
        themeTokens["tab.active_background"],
        opacity,
      ),
      "--axon-panel-background": colorWithAlpha(
        themeTokens["panel.background"],
        opacity,
      ),
      "--axon-panel-border": colorWithAlpha(
        themeTokens["panel.border"],
        Math.min(1, opacity + 0.25),
      ),
      "--axon-panel-overlay-hover": colorWithAlpha(
        themeTokens["panel.overlay_hover"],
        Math.min(1, opacity + 0.2),
      ),
      "--axon-status-bar-background": colorWithAlpha(
        themeTokens["status_bar.background"],
        opacity,
      ),
      "--axon-editor-background": colorWithAlpha(
        themeTokens["editor.background"],
        opacity,
      ),
      "--axon-editor-gutter-background": colorWithAlpha(
        themeTokens["editor.gutter.background"],
        opacity,
      ),
      "--axon-terminal-background": colorWithAlpha(
        themeTokens["terminal.background"],
        opacity,
      ),
    } as typeof themeCssVariables;
  }, [
    settings.editor.appBackgroundOpacity,
    settings.editor.appTransparency,
    themeCssVariables,
    themeTokens,
  ]);

  const diagnostics = useMemo(() => {
    const mergedDiagnostics = [
      ...projectDiagnostics,
      ...monacoDiagnostics,
      ...Object.values(lspDiagnosticsByFile).flat(),
    ].filter((diagnostic) => isDiagnosticInWorkspace(diagnostic, folderPath));
    const seenDiagnostics = new Set<string>();

    return mergedDiagnostics.filter((diagnostic) => {
      const key = [
        diagnostic.path,
        diagnostic.line,
        diagnostic.column,
        diagnostic.endLine ?? diagnostic.line,
        diagnostic.endColumn ?? diagnostic.column,
        diagnostic.severity,
        diagnostic.message,
      ].join("\u0000");

      if (seenDiagnostics.has(key)) return false;
      seenDiagnostics.add(key);
      return true;
    });
  }, [folderPath, lspDiagnosticsByFile, monacoDiagnostics, projectDiagnostics]);

  const diagnosticCounts = useMemo(
    () =>
      diagnostics.reduce(
        (counts, diagnostic) => {
          counts.total += 1;
          counts[diagnostic.severity] += 1;
          return counts;
        },
        { total: 0, error: 0, warning: 0, info: 0, hint: 0 },
      ),
    [diagnostics],
  );

  const activeFileSymbols = useMemo<FileSymbol[]>(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return [];
    const model = getModel(activeFile);
    if (!model || model.isDisposed()) return [];
    return collectFileSymbols(model.getValue());
  }, [activePane?.activeFile, layout]);

  const activeFileContent = useMemo(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return "";
    const model = getModel(activeFile);
    return model && !model.isDisposed() ? model.getValue() : "";
  }, [activePane?.activeFile, layout]);

  const gitChangeCount = gitStatus?.changes.length ?? 0;
  const deletedFiles = useMemo(() => {
    return new Set(
      (gitStatus?.changes ?? [])
        .filter(
          (change: any) =>
            change.worktreeState === "deleted" ||
            change.indexState === "deleted",
        )
        .map((change: any) => change.absolutePath),
    );
  }, [gitStatus?.changes]);

  return {
    activeFileContent,
    activeFileSymbols,
    activePane,
    appThemeCssVariables,
    deletedFiles,
    diagnosticCounts,
    diagnostics,
    extensionThemes,
    gitChangeCount,
    themeTokens,
    workspaceTrusted,
  };
}
