import { useEffect, useMemo } from "react";
import { getWorkspaceTrustState } from "../../../renderer/features/sidebar";
import { isDiagnosticInWorkspace } from "@axon-builtin-problems/lib/diagnosticCache";
import { getModel } from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { collectFileSymbols } from "../../../renderer/features/sidebar/files/lib/fileSymbols";
import {
  createThemeCssVariables,
  resolveThemeTokens,
} from "../../../renderer/shared/lib/themeTokens";
import { resolveActiveTheme } from "../../../renderer/shared/themes";
import type { FileSymbol } from "../../../renderer/features/sidebar/files/lib/fileSymbols";
import { getEnabledExtensionThemes } from "../../../shared/extensions";
import { createGlassThemeCssVariables } from "./glassTheme";

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
  const activePane = layout.panes.find(
    (p: any) => p.id === layout.activePaneId,
  );
  const workspaceTrusted = useMemo(
    () => getWorkspaceTrustState(folderPath) !== false,
    [folderPath, workspaceTrustNonce],
  );

  const extensionThemes = useMemo(
    () => getEnabledExtensionThemes(extensionState),
    [extensionState],
  );
  const activeTheme = useMemo(
    () => resolveActiveTheme(settings.editor.themeId, extensionThemes),
    [extensionThemes, settings.editor.themeId],
  );
  const themeTokens = useMemo(
    () => resolveThemeTokens(settings, extensionThemes),
    [extensionThemes, settings],
  );
  const themeSyntax = activeTheme.syntax;
  const themeAppearance = activeTheme.appearance;
  const themeCssVariables = useMemo(
    () => createThemeCssVariables(themeTokens, themeAppearance),
    [themeAppearance, themeTokens],
  );
  const appThemeCssVariables = useMemo(() => {
    if (settings.editor.appGlassMode === "off") return themeCssVariables;

    return createGlassThemeCssVariables(
      themeCssVariables,
      themeTokens,
      themeAppearance,
      settings.editor.appBackgroundOpacity,
      settings.editor.appBackgroundBlur,
    );
  }, [
    settings.editor.appBackgroundBlur,
    settings.editor.appBackgroundOpacity,
    settings.editor.appGlassMode,
    themeAppearance,
    themeCssVariables,
    themeTokens,
  ]);

  useEffect(() => {
    const glassActive = settings.editor.appGlassMode !== "off";
    document.documentElement.classList.toggle("axon-native-glass", glassActive);

    void window.axon
      .setWindowGlass(
        settings.editor.appGlassMode,
        themeTokens.background,
        themeAppearance,
      )
      .catch((error) => {
        console.warn("failed to synchronize native window glass:", error);
      });

    return () => {
      document.documentElement.classList.remove("axon-native-glass");
    };
  }, [
    settings.editor.appGlassMode,
    themeAppearance,
    themeTokens.background,
  ]);

  useEffect(() => {
    const roots = [document.documentElement, document.body].filter(Boolean);
    const variableEntries = Object.entries(appThemeCssVariables).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("--axon-") && typeof entry[1] === "string",
    );

    // Some UI pieces, such as tab context menus and command-style popups, are
    // mounted into document.body with React portals so they can escape clipped
    // editor panes. Those nodes do not inherit CSS variables from the Axon app
    // container, so I mirror the resolved theme variables onto the document
    // roots. Without this bridge, dark themes can render portal menus with
    // browser-default black text, transparent backgrounds, and unreadable
    // borders even though the in-tree editor chrome is themed correctly.
    roots.forEach((root) => {
      variableEntries.forEach(([name, value]) => {
        root.style.setProperty(name, value);
      });
    });

    return () => {
      roots.forEach((root) => {
        variableEntries.forEach(([name]) => {
          root.style.removeProperty(name);
        });
      });
    };
  }, [appThemeCssVariables]);

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
    activeThemeId: activeTheme.id,
    appThemeCssVariables,
    deletedFiles,
    diagnosticCounts,
    diagnostics,
    extensionThemes,
    gitChangeCount,
    themeSyntax,
    themeTokens,
    workspaceTrusted,
  };
}
