/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeSettings, type AxonSettings } from "@axon-editor/shared/settings";
import { type AiModelInfo } from "@axon-editor/shared/ai";
import {
  getEnabledExtensionThemes,
  type ExtensionState,
} from "@axon-editor/shared/extensions";
import {
  EDITOR_FONT_ITEMS,
  SETTINGS_SECTIONS,
  UI_FONT_ITEMS,
  type SettingsSectionId,
} from "./lib/settingsData";
import { FONT_PRESET_VALUES } from "./lib/fontPresets";
import { matchSettingsSections } from "./search/settingsSearch";
import {
  matchSettingsRows,
  type SettingsRowMatch,
} from "./search/settingsRowIndex";
import { revealSettingsRow } from "./lib/settingsRowFocus";
import {
  getSettingsPythonWorkspaceEnvironment,
  importSettingsFont,
  selectSettingsBackgroundImage,
  selectSettingsPythonVirtualEnv,
} from "./lib/settingsPlatform";
import SettingsSidebar from "./chrome/SettingsSidebar";
import SettingsHeader from "./chrome/SettingsHeader";
import SettingsFooter from "./chrome/SettingsFooter";
import { type SettingsSaveState } from "./chrome/types";
import AppearanceSettingsSection from "./sections/AppearanceSettingsSection";
import EditorSettingsSection from "./sections/EditorSettingsSection";
import EditorBehaviorSettingsSection from "./sections/EditorBehaviorSettingsSection";
import TerminalSettingsSection from "./sections/TerminalSettingsSection";
import BackgroundSettingsSection from "./sections/BackgroundSettingsSection";
import FontsSettingsSection from "./sections/FontsSettingsSection";
import LanguageServersSettingsSection from "./sections/LanguageServersSettingsSection";
import AxonAgentSettingsSection from "./sections/AxonAgentSettingsSection";
import FinderSettingsSection from "./sections/FinderSettingsSection";

interface SettingsTabProps {
  folderPath: string | null;
  language: string;
  availableFonts: AxonSettings["customFonts"];
  extensionState: ExtensionState | null;
  settings: AxonSettings;
  onCloseTab: () => void;
  onPreview: (settings: AxonSettings) => void;
  onSave: (
    settings: AxonSettings,
  ) => boolean | void | Promise<boolean | void>;
  onOpenLanguageTools: () => void;
  onViewLogs: () => void;
}

export default function SettingsTab({
  folderPath,
  language,
  availableFonts,
  extensionState,
  settings,
  onCloseTab,
  onPreview,
  onSave,
  onOpenLanguageTools,
  onViewLogs,
}: SettingsTabProps) {
  const initialSettingsRef = useRef(settings);
  const [draft, setDraft] = useState(settings);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("appearance");
  const [sectionQuery, setSectionQuery] = useState("");
  const [fontImportError, setFontImportError] = useState<string | null>(null);
  const [backgroundImageError, setBackgroundImageError] = useState<
    string | null
  >(null);
  const [pythonEnvironmentMessage, setPythonEnvironmentMessage] = useState<
    string | null
  >(null);
  const [pythonDetected, setPythonDetected] = useState(false);
  const [aiModels, setAiModels] = useState<AiModelInfo[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiModelsError, setAiModelsError] = useState<string | null>(null);
  const [aiModelsRefreshNonce, setAiModelsRefreshNonce] = useState(0);
  const [saveState, setSaveState] = useState<SettingsSaveState>("saved");
  const previewReadyRef = useRef(false);
  const autoSaveReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveRequestRef = useRef(0);
  const lastStartedSettingsJsonRef = useRef<string | null>(null);
  const latestSettingsJsonRef = useRef<string | null>(null);
  // The sidebar auto-jumps to the best matching page while a search is active,
  // but clearing the search should land back on whichever page the user chose
  // by hand, not on the last auto-jump.
  const lastManualSectionRef = useRef<SettingsSectionId>("appearance");
  // Set when a row result is picked from the search popup; revealed on the
  // next frame once the target section has actually rendered.
  const pendingRowKeyRef = useRef<string | null>(null);
  // The tab can unmount without an explicit close (tab-bar X, pane split, app
  // quit), so the newest draft and the persist callback this render live in
  // refs for a mount-only flush that runs on every exit path. persistSettings
  // is defined below the draft memos, so this ref starts as a no-op stub and
  // is pointed at the live callback on every render.
  const latestDraftRef = useRef(draft);
  const latestDraftJsonRef = useRef("");
  const persistSettingsRef = useRef(
    (_settings: AxonSettings, _settingsJson: string) => {},
  );

  const customFontItems = useMemo(
    () => {
      const fontsByFamily = new Map(
        [...availableFonts, ...draft.customFonts].map((font) => [
          font.family,
          font,
        ]),
      );

      return [...fontsByFamily.values()].map((font) => ({
        value: font.family,
        label: font.family,
        description: font.path,
        previewFontFamily: font.family,
      }));
    },
    [availableFonts, draft.customFonts],
  );
  const uiFontItems = useMemo(
    () => [...UI_FONT_ITEMS, ...customFontItems],
    [customFontItems],
  );
  const editorFontItems = useMemo(
    () => [...EDITOR_FONT_ITEMS, ...customFontItems],
    [customFontItems],
  );
  const extensionThemes = useMemo(
    () => getEnabledExtensionThemes(extensionState),
    [extensionState],
  );
  const themeItems = useMemo(
    () =>
      extensionThemes.map((theme) => ({
        value: theme.id,
        label: theme.label,
        description: `${theme.extensionName} extension`,
      })),
    [extensionThemes],
  );
  const activeSectionMeta =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];
  const normalizedInitialSettings = useMemo(
    () => normalizeSettings(initialSettingsRef.current),
    [],
  );
  const normalizedDraft = useMemo(() => normalizeSettings(draft), [draft]);
  const normalizedInitialSettingsJson = useMemo(
    () => JSON.stringify(normalizedInitialSettings),
    [normalizedInitialSettings],
  );
  const normalizedDraftJson = useMemo(
    () => JSON.stringify(normalizedDraft),
    [normalizedDraft],
  );
  latestSettingsJsonRef.current = normalizedDraftJson;
  latestDraftRef.current = draft;
  latestDraftJsonRef.current = normalizedDraftJson;
  const dirty = normalizedDraftJson !== normalizedInitialSettingsJson;
  const settingsScopeLabel = folderPath
    ? folderPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "workspace"
    : "global";
  const queryMatches = useMemo(
    () => matchSettingsSections(sectionQuery),
    [sectionQuery],
  );
  const rowMatches = useMemo(
    () => matchSettingsRows(sectionQuery),
    [sectionQuery],
  );

  useEffect(() => {
    if (!sectionQuery.trim()) return;
    if (queryMatches.length === 0) return;
    if (!queryMatches.some((match) => match.id === activeSection)) {
      setActiveSection(queryMatches[0].id);
    }
  }, [sectionQuery, queryMatches, activeSection]);

  const handleSectionChange = (section: SettingsSectionId) => {
    lastManualSectionRef.current = section;
    setActiveSection(section);
  };

  const handleSectionQueryChange = (query: string) => {
    setSectionQuery(query);
    if (!query.trim()) {
      setActiveSection(lastManualSectionRef.current);
    }
  };

  // Selecting a page from the search popup behaves exactly like clicking it in
  // the sidebar, except the query resets so the popup does not linger and the
  // user returns to a browsing state in the section they landed on.
  const handleOpenSection = (section: SettingsSectionId) => {
    lastManualSectionRef.current = section;
    setActiveSection(section);
    setSectionQuery("");
  };

  // Picking a row navigates to its page and then scrolls the exact control
  // into view with an accent flash. React batches the two state updates, so
  // the target element only exists after the commit; the double requestAnimationFrame
  // waits for that render plus layout before revealing the anchor.
  const handleOpenRow = (match: SettingsRowMatch) => {
    pendingRowKeyRef.current = match.rowKey;
    lastManualSectionRef.current = match.sectionId;
    setActiveSection(match.sectionId);
    setSectionQuery("");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rowKey = pendingRowKeyRef.current;
        pendingRowKeyRef.current = null;
        if (rowKey) revealSettingsRow(rowKey);
      });
    });
  };

  useEffect(() => {
    let cancelled = false;
    setPythonDetected(false);
    setPythonEnvironmentMessage(null);
    if (!folderPath) return;

    getSettingsPythonWorkspaceEnvironment(folderPath, language)
      .then((status) => {
        if (cancelled) return;
        setPythonDetected(status.pythonDetected);
        if (!status.pythonDetected) return;

        // Main owns interpreter discovery because it can inspect the workspace
        // and developer shell safely. Mirroring its result into the draft makes
        // the path fields truthful as soon as Settings opens, including Poetry,
        // Pipenv, uv, pyenv, Conda, and arbitrarily named pyvenv.cfg folders.
        setDraft((current) => ({
          ...current,
          lsp: {
            ...current.lsp,
            pythonVirtualEnvPath: status.virtualEnvPath,
            pythonInterpreterPath: status.interpreterPath,
          },
        }));
        setPythonEnvironmentMessage(
          status.virtualEnvPath
            ? `Detected project environment: ${status.virtualEnvPath}`
            : status.interpreterPath
              ? "No project virtual environment was detected. Axon is using the interpreter shown below."
              : "No Python environment or interpreter was detected for this workspace.",
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("failed to detect workspace Python environment:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath, language]);

  useEffect(() => {
    if (activeSection !== "ai") return;

    let cancelled = false;
    setAiModelsLoading(true);
    setAiModelsError(null);

    window.axon
      .listAiModels(folderPath)
      .then((models) => {
        if (cancelled) return;
        setAiModels(models);
      })
      .catch((error) => {
        if (cancelled) return;
        setAiModelsError(
          error instanceof Error
            ? error.message
            : "Available Axon models could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setAiModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, aiModelsRefreshNonce, folderPath]);

  useEffect(() => {
    if (!previewReadyRef.current) {
      previewReadyRef.current = true;
      return;
    }

    // Settings controls should feel like editor preferences, not a form that
    // only matters after leaving the page. The preview is lightly coalesced
    // because applying settings can redraw the editor chrome, Monaco, terminal,
    // and portal surfaces. Without this delay, each typed character in a text
    // field can trigger a full app repaint before React has finished the input
    // update, which is the slow path users feel in the settings UI.
    //
    const previewTimer = setTimeout(() => {
      onPreview(normalizedDraft);
    }, 80);

    return () => clearTimeout(previewTimer);
  }, [normalizedDraft, normalizedDraftJson, onPreview]);

  const persistSettings = useCallback(
    (nextSettings: AxonSettings, nextSettingsJson: string) => {
      if (lastStartedSettingsJsonRef.current === nextSettingsJson) return;

      lastStartedSettingsJsonRef.current = nextSettingsJson;
      const requestId = ++saveRequestRef.current;
      setSaveState("saving");

      void Promise.resolve(onSave(nextSettings))
        .then((saved) => {
          if (
            requestId !== saveRequestRef.current ||
            latestSettingsJsonRef.current !== nextSettingsJson
          ) {
            return;
          }
          if (saved === false) {
            lastStartedSettingsJsonRef.current = null;
            setSaveState("error");
            return;
          }
          setSaveState("saved");
        })
        .catch((error) => {
          if (
            requestId !== saveRequestRef.current ||
            latestSettingsJsonRef.current !== nextSettingsJson
          ) {
            return;
          }
          lastStartedSettingsJsonRef.current = null;
          setSaveState("error");
          console.error("failed to auto-save settings:", error);
        });
    },
    [onSave],
  );
  persistSettingsRef.current = persistSettings;

  useEffect(() => {
    if (!autoSaveReadyRef.current) {
      autoSaveReadyRef.current = true;
      lastStartedSettingsJsonRef.current = normalizedDraftJson;
      return;
    }
    if (lastStartedSettingsJsonRef.current === normalizedDraftJson) return;

    // Preview remains fast enough for theme and editor controls to feel direct,
    // while persistence waits for a short idle window. This keeps sliders and
    // text fields from sending one IPC write per input event without bringing
    // back a manual Apply or Save step.
    setSaveState("saving");
    // The timer fires through persistSettingsRef instead of depending on the
    // persistSettings identity because that identity changes with onSave, which
    // the dedicated window surface re-creates on every render. Depending on it
    // here would cancel and re-arm the debounce on each preview re-render,
    // keeping the save from ever firing while the status sits in "saving".
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistSettingsRef.current(normalizedDraft, normalizedDraftJson);
    }, 300);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [normalizedDraft, normalizedDraftJson]);

  useEffect(() => {
    // "Close" is reachable two ways: the header/footer buttons (which flush in
    // close()) and the tab-bar X (which unmounts this component without an exit
    // event). The latter would cancel the debounced save timer via the effect
    // above, so this mount-only cleanup flushes the newest draft on every
    // unmount path and keeps a change made moments before closing from being
    // lost on restart. persistSettings short-circuits when the draft matches
    // the last persisted JSON, so flush-on-close is never a duplicate write.
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void persistSettingsRef.current(
        latestDraftRef.current,
        latestDraftJsonRef.current,
      );
    };
  }, []);

  const updateEditor = <K extends keyof AxonSettings["editor"]>(
    key: K,
    value: AxonSettings["editor"][K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      editor: {
        ...prev.editor,
        [key]: value,
      },
    }));
  };

  const updateAi = <K extends keyof AxonSettings["ai"]>(
    key: K,
    value: AxonSettings["ai"][K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      ai: {
        ...prev.ai,
        [key]: value,
      },
    }));
  };

  const updateTerminal = <K extends keyof AxonSettings["terminal"]>(
    key: K,
    value: AxonSettings["terminal"][K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      terminal: {
        ...prev.terminal,
        [key]: value,
      },
    }));
  };

  const updateLsp = <K extends keyof AxonSettings["lsp"]>(
    key: K,
    value: AxonSettings["lsp"][K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      lsp: {
        ...prev.lsp,
        [key]: value,
      },
    }));
  };

  const applyFontPreset = (presetId: AxonSettings["editor"]["fontPreset"]) => {
    setDraft((prev) => ({
      ...prev,
      editor: {
        ...prev.editor,
        ...FONT_PRESET_VALUES[presetId],
      },
    }));
  };

  const importFont = async () => {
    setFontImportError(null);

    try {
      const importedFont = await importSettingsFont();
      if (!importedFont) return;

      setDraft((prev) => {
        const existingFonts = prev.customFonts.filter(
          (font) => font.family !== importedFont.family,
        );

        return {
          ...prev,
          customFonts: [...existingFonts, importedFont],
        };
      });
      setActiveSection("fonts");
    } catch (err) {
      console.error("failed to import font:", err);
      setFontImportError("Could not import that font file.");
    }
  };

  const selectEditorBackgroundImage = async () => {
    setBackgroundImageError(null);

    try {
      const imagePath = await selectSettingsBackgroundImage();
      if (!imagePath) return;
      updateEditor("backgroundImagePath", imagePath);
      setActiveSection("background");
    } catch (err) {
      console.error("failed to select editor background image:", err);
      setBackgroundImageError("Could not use that image as the editor background.");
    }
  };

  const selectPythonVirtualEnv = async () => {
    setPythonEnvironmentMessage(null);

    try {
      const selected = await selectSettingsPythonVirtualEnv(folderPath);
      if (!selected) return;

      setDraft((prev) => ({
        ...prev,
        lsp: {
          ...prev.lsp,
          pythonVirtualEnvPath: selected.virtualEnvPath,
          pythonInterpreterPath: selected.interpreterPath,
        },
      }));
      setPythonEnvironmentMessage(
        "Python virtual environment selected. Pyright will use it for external packages automatically.",
      );
    } catch (err) {
      setPythonEnvironmentMessage(
        err instanceof Error
          ? err.message
          : "Failed to select Python virtual environment.",
      );
    }
  };

  const clearPythonVirtualEnv = () => {
    setDraft((prev) => ({
      ...prev,
      lsp: {
        ...prev.lsp,
        pythonVirtualEnvPath: "",
        pythonInterpreterPath: "",
      },
    }));
    setPythonEnvironmentMessage(
      "Python virtual environment cleared. Python still works with Pyright's default interpreter resolution.",
    );
  };

  const removeFont = (family: string) => {
    setDraft((prev) => {
      const nextSettings = {
        ...prev,
        customFonts: prev.customFonts.filter((font) => font.family !== family),
        editor: {
          ...prev.editor,
          uiFontFamily:
            prev.editor.uiFontFamily === family
              ? "system-ui"
              : prev.editor.uiFontFamily,
          fontFamily:
            prev.editor.fontFamily === family
              ? ".AxonMono"
              : prev.editor.fontFamily,
        },
      };

      return nextSettings;
    });
  };

  const close = () => {
    // The tab can leave this page through Escape-clear, the header/footer
    // actions, or a pane move. Flush the newest normalized draft here so the
    // settings page never appears to apply a setting and then loses it on
    // restart. The unmount cleanup preserves the same guarantee for the
    // tab-bar X path that bypasses this callback.
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    persistSettings(normalizedDraft, normalizedDraftJson);
    onCloseTab();
  };

  const resetDraft = () => {
    setDraft(initialSettingsRef.current);
    onPreview(initialSettingsRef.current);
  };

  const scopeHint = folderPath
    ? "Workspace settings inherit from user settings and can be overridden by axon.json."
    : "No workspace is open, so changes apply to your user settings only.";

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-[216px_1fr] overflow-hidden">
      <SettingsSidebar
        activeSection={activeSection}
        query={sectionQuery}
        queryMatches={queryMatches}
        sectionIds={queryMatches.map((match) => match.id)}
        rows={rowMatches}
        saveState={saveState}
        hasDirtyChanges={dirty}
        onSectionChange={handleSectionChange}
        onQueryChange={handleSectionQueryChange}
        onSelectSection={handleOpenSection}
        onSelectRow={handleOpenRow}
      />

      <div className="flex min-h-0 flex-col bg-[var(--axon-editor-background)]">
        <SettingsHeader
          activeSectionMeta={activeSectionMeta}
          scopeMode={folderPath ? "workspace" : "user"}
          scopePathLabel={settingsScopeLabel}
          scopeHint={scopeHint}
          dirty={dirty}
          onReset={resetDraft}
          onClose={close}
        />
        {/* Remounting this scroll area on every section change replays the
            enter animation, so switching pages fades the new controls in
            instead of swapping them with no visual feedback. */}
        <div
          key={activeSection}
          className="axon-settings-enter min-h-0 flex-1 overflow-y-auto px-7 py-6"
        >
          {activeSection === "appearance" && (
            <AppearanceSettingsSection
              draft={draft}
              themeItems={themeItems}
              uiFontItems={uiFontItems}
              onUpdateEditor={updateEditor}
            />
          )}

          {activeSection === "editor" && (
            <>
              <EditorSettingsSection
                draft={draft}
                editorFontItems={editorFontItems}
                onApplyFontPreset={applyFontPreset}
                onUpdateEditor={updateEditor}
              />
              <EditorBehaviorSettingsSection
                draft={draft}
                onUpdateEditor={updateEditor}
              />
            </>
          )}

          {activeSection === "terminal" && (
            <TerminalSettingsSection
              draft={draft}
              onUpdateTerminal={updateTerminal}
            />
          )}

          {activeSection === "background" && (
            <BackgroundSettingsSection
              backgroundImageError={backgroundImageError}
              draft={draft}
              onSelectEditorBackgroundImage={() =>
                void selectEditorBackgroundImage()
              }
              onUpdateEditor={updateEditor}
            />
          )}

          {activeSection === "fonts" && (
            <FontsSettingsSection
              draft={draft}
              fontImportError={fontImportError}
              onImportFont={() => void importFont()}
              onRemoveFont={removeFont}
              onUpdateEditor={updateEditor}
            />
          )}

          {activeSection === "languageServers" && (
            <LanguageServersSettingsSection
              draft={draft}
              folderPath={folderPath}
              onClearPythonVirtualEnv={clearPythonVirtualEnv}
              onOpenLanguageTools={onOpenLanguageTools}
              onSelectPythonVirtualEnv={() => void selectPythonVirtualEnv()}
              onUpdateLsp={updateLsp}
              onViewLogs={onViewLogs}
              pythonDetected={pythonDetected}
              pythonEnvironmentMessage={pythonEnvironmentMessage}
            />
          )}

          {activeSection === "ai" && (
            <AxonAgentSettingsSection
              draft={draft}
              models={aiModels}
              modelsError={aiModelsError}
              modelsLoading={aiModelsLoading}
              onRefreshModels={() =>
                setAiModelsRefreshNonce((nonce) => nonce + 1)
              }
              onUpdateAi={updateAi}
            />
          )}

          {activeSection === "finder" && (
            <FinderSettingsSection />
          )}
        </div>

        <SettingsFooter
          dirty={dirty}
          onClose={close}
          onReset={resetDraft}
          saveState={saveState}
        />
      </div>
    </div>
  );
}