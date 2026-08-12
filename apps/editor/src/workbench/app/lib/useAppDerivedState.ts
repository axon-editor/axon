import { useEffect, useMemo } from "react";
import { getWorkspaceTrustState } from "../../../renderer/features/sidebar";
import { isDiagnosticInWorkspace } from "@axon-builtin-problems/lib/diagnosticCache";
import { getModel } from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { collectFileSymbols } from "../../../renderer/features/sidebar/files/lib/fileSymbols";
import {
  createThemeCssVariables,
  resolveThemeTokens,
} from "../../../renderer/shared/lib/themeTokens";
import type { FileSymbol } from "../../../renderer/features/sidebar/files/lib/fileSymbols";
import { getEnabledExtensionThemes } from "../../../shared/extensions";
import { appearanceBorderColor } from "../../../renderer/shared/themes/themeAppearance";

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

function opaqueColor(color: string) {
  const normalizedColor = color.trim();
  const match = normalizedColor.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  return match ? `#${match[1]}` : color;
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
  const themeTokens = useMemo(
    () => resolveThemeTokens(settings, extensionThemes),
    [extensionThemes, settings],
  );
  const themeSyntax = useMemo(
    () =>
      extensionThemes.find((theme: any) => theme.id === settings.editor.themeId)
        ?.syntax ?? {},
    [extensionThemes, settings.editor.themeId],
  );
  const themeAppearance = useMemo(
    () =>
      extensionThemes.find((theme: any) => theme.id === settings.editor.themeId)
        ?.appearance ?? "dark",
    [extensionThemes, settings.editor.themeId],
  );
  const themeCssVariables = useMemo(
    () => createThemeCssVariables(themeTokens, themeAppearance),
    [themeAppearance, themeTokens],
  );
  const appThemeCssVariables = useMemo(() => {
    if (settings.editor.appGlassMode === "off") return themeCssVariables;

    const opacity = settings.editor.appBackgroundOpacity;
    const lightGlass = themeAppearance === "light";
    const modalOpacity = lightGlass
      ? Math.max(0.9, Math.min(0.96, opacity + 0.12))
      : Math.max(0.78, Math.min(0.9, opacity + 0.04));
    const popupOpacity = lightGlass
      ? Math.max(0.94, Math.min(0.98, opacity + 0.14))
      : Math.max(0.86, Math.min(0.96, opacity + 0.08));

    // Native vibrancy or material owns the expensive full-window blur. These
    // alpha colors tint that shared backdrop for continuously visible editor
    // surfaces. Only temporary modal and popup surfaces add a local CSS frost;
    // light themes reduce backdrop saturation so desktop colors cannot muddy
    // warm backgrounds such as Axon Parchment or weaken dark text contrast.
    return {
      ...themeCssVariables,
      "--axon-glass-surface-blur": `${settings.editor.appBackgroundBlur * 2}px`,
      "--axon-glass-surface-saturation": lightGlass ? "72%" : "108%",
      "--axon-modal-glass-background": colorWithAlpha(
        themeTokens["editor.background"],
        modalOpacity,
      ),
      "--axon-popup-background": colorWithAlpha(
        themeTokens["panel.background"],
        popupOpacity,
      ),
      "--axon-solid-popup-background": opaqueColor(
        themeTokens["panel.background"],
      ),
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
      "--axon-sidebar-hover-background": colorWithAlpha(
        themeTokens["sidebar.hover_background"],
        Math.min(1, opacity + 0.2),
      ),
      "--axon-sidebar-border": appearanceBorderColor(
        themeTokens["sidebar.border"],
        themeAppearance,
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
      "--axon-panel-border": appearanceBorderColor(
        themeTokens["panel.border"],
        themeAppearance,
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
      .setWindowGlass(settings.editor.appGlassMode, themeTokens.background)
      .catch((error) => {
        console.warn("failed to synchronize native window glass:", error);
      });

    return () => {
      document.documentElement.classList.remove("axon-native-glass");
    };
  }, [settings.editor.appGlassMode, themeTokens.background]);

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
