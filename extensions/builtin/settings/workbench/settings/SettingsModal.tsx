import { useEffect, useMemo, useRef, useState } from "react";
import { Braces } from "lucide-react";
import { normalizeSettings, type AxonSettings } from "@axon-editor/shared/settings";
import {
  getEnabledExtensionThemes,
  type ExtensionState,
} from "@axon-editor/shared/extensions";
import { type LanguageServerStatus } from "@axon-editor/shared/lsp";
import CommandModal from "@axon-editor/renderer/shared/components/CommandModal";
import {
  EDITOR_FONT_ITEMS,
  SETTINGS_SECTIONS,
  UI_FONT_ITEMS,
  type SettingsSectionId,
} from "./lib/settingsData";
import { FONT_PRESET_VALUES } from "./lib/fontPresets";
import {
  getSettingsLanguageServerStatus,
  importSettingsFont,
  selectSettingsBackgroundImage,
  selectSettingsPythonVirtualEnv,
  startSettingsLanguageServers,
  stopSettingsLanguageServers,
} from "./lib/settingsPlatform";
import AppearanceSettingsSection from "./AppearanceSettingsSection";
import AxonAgentSettingsSection from "./AxonAgentSettingsSection";
import EditorSettingsSection from "./EditorSettingsSection";
import ErgonomicsSettingsSection from "./ErgonomicsSettingsSection";
import LanguageServersSettingsSection from "./LanguageServersSettingsSection";
import {
  BackgroundSettingsSection,
  FontsSettingsSection,
} from "./SettingsMediaSections";
import {
  SettingsModalFooter,
  SettingsModalHeader,
  SettingsModalSidebar,
} from "./SettingsModalChrome";

interface Props {
  folderPath: string | null;
  workspaceTrusted: boolean;
  availableFonts: AxonSettings["customFonts"];
  extensionState: ExtensionState | null;
  settings: AxonSettings;
  onClose: () => void;
  onPreview: (settings: AxonSettings) => void;
  onSave: (settings: AxonSettings) => void;
  onViewLogs: () => void;
}

export default function SettingsModal({
  folderPath,
  workspaceTrusted,
  availableFonts,
  extensionState,
  settings,
  onClose,
  onPreview,
  onSave,
  onViewLogs,
}: Props) {
  const initialSettingsRef = useRef(settings);
  const [draft, setDraft] = useState(settings);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("appearance");
  const [sectionQuery, setSectionQuery] = useState("");
  const [fontImportError, setFontImportError] = useState<string | null>(null);
  const [backgroundImageError, setBackgroundImageError] = useState<
    string | null
  >(null);
  const [languageServers, setLanguageServers] = useState<
    LanguageServerStatus[]
  >([]);
  const [loadingLanguageServers, setLoadingLanguageServers] = useState(false);
  const [languageServerAction, setLanguageServerAction] = useState<
    "start" | "stop" | "restart" | null
  >(null);
  const [languageServerMessage, setLanguageServerMessage] = useState<
    string | null
  >(null);
  const previewReadyRef = useRef(false);

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
  const dirty = normalizedDraftJson !== normalizedInitialSettingsJson;
  const settingsScopeLabel = folderPath
    ? folderPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "workspace"
    : "global";
  const filteredSections = useMemo(() => {
    const normalizedQuery = sectionQuery.trim().toLowerCase();
    if (!normalizedQuery) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter((section) =>
      `${section.label} ${section.description}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [sectionQuery]);

  useEffect(() => {
    if (!previewReadyRef.current) {
      previewReadyRef.current = true;
      return;
    }

    // Settings controls should feel like editor preferences, not a form that
    // only matters after closing the modal. The preview is lightly coalesced
    // because applying settings can redraw the editor chrome, Monaco, terminal,
    // and portal surfaces. Without this delay, each typed character in a text
    // field can trigger a full app repaint before React has finished the input
    // update, which is the slow path users feel in the settings modal.
    //
    const previewTimer = setTimeout(() => {
      onPreview(normalizedDraft);
    }, 80);

    return () => clearTimeout(previewTimer);
  }, [normalizedDraft, normalizedDraftJson, onPreview]);

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
    setLanguageServerMessage(null);

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
      setLanguageServerMessage(
        "Python virtual environment selected. Pyright will use it for external packages after you save settings.",
      );
    } catch (err) {
      setLanguageServerMessage(
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
    setLanguageServerMessage(
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

  const refreshLanguageServers = async () => {
    if (!folderPath) {
      setLanguageServers([]);
      return;
    }

    setLoadingLanguageServers(true);
    try {
      const nextServers = await getSettingsLanguageServerStatus(folderPath);
      setLanguageServers(nextServers);
    } catch (err) {
      console.error("failed to load language server status:", err);
      setLanguageServers([]);
    } finally {
      setLoadingLanguageServers(false);
    }
  };

  const runLanguageServerAction = async (
    action: "start" | "stop" | "restart",
  ) => {
    if (!folderPath) return;
    if (!workspaceTrusted) {
      setLanguageServerMessage(
        "Language servers are disabled until this workspace is trusted.",
      );
      return;
    }

    setLanguageServerAction(action);
    setLanguageServerMessage(null);
    try {
      if (action === "restart") {
        onSave(normalizedDraft);
      }

      const result =
        action === "start"
          ? await startSettingsLanguageServers(folderPath)
          : action === "stop"
            ? await stopSettingsLanguageServers(folderPath)
            : await stopSettingsLanguageServers(folderPath).then(() =>
                startSettingsLanguageServers(folderPath),
              );
      setLanguageServers(result.servers);
      setLanguageServerMessage(result.message);
    } catch (err) {
      console.error(`failed to ${action} language servers:`, err);
      const message = err instanceof Error ? err.message : "";
      setLanguageServerMessage(
        message ||
          (action === "start"
            ? "Failed to start language servers."
            : action === "restart"
              ? "Failed to restart language servers."
            : "Failed to stop language servers."),
      );
    } finally {
      setLanguageServerAction(null);
    }
  };

  useEffect(() => {
    if (activeSection !== "languageServers") return;
    void refreshLanguageServers();
  }, [activeSection, folderPath]);

  const save = () => {
    onSave(normalizedDraft);
    onClose();
  };

  const hasPythonWorkspace = languageServers.some(
    (server) => server.id === "python" && server.relevant,
  );

  const close = () => {
    // Because the modal previews settings live, closing without saving needs
    // to behave like Cancel in other editors: the visible app returns to the
    // values that were active before the settings session began. Save bypasses
    // this function and persists the current draft instead.
    onPreview(initialSettingsRef.current);
    onClose();
  };

  const resetDraft = () => {
    setDraft(initialSettingsRef.current);
    onPreview(initialSettingsRef.current);
  };

  return (
    <CommandModal
      onClose={close}
      width="w-[min(1120px,calc(100vw-2rem))]"
      bodyClassName="flex min-h-0 flex-1 overflow-hidden"
      panelStyle={{
        height: "min(820px, calc(100vh - 3rem))",
        minHeight: "min(680px, calc(100vh - 3rem))",
      }}
    >
      <div className="grid h-full min-h-0 w-full grid-cols-[300px_1fr] overflow-hidden rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-2xl">
        <SettingsModalSidebar
          activeSection={activeSection}
          dirty={dirty}
          filteredSections={filteredSections}
          sectionQuery={sectionQuery}
          onSectionChange={setActiveSection}
          onSectionQueryChange={setSectionQuery}
        />

        <div className="flex min-h-0 flex-col bg-[var(--axon-editor-background)]">
          <SettingsModalHeader
            activeSectionMeta={activeSectionMeta}
            dirty={dirty}
            folderPath={folderPath}
            settingsScopeLabel={settingsScopeLabel}
            onReset={resetDraft}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
              <Braces size={13} />
              <span>
                {folderPath
                  ? "Workspace settings inherit from user settings and can be overridden by axon.json."
                  : "No workspace is open, so changes apply to your user settings only."}
              </span>
            </div>

            {activeSection === "appearance" && (
              <AppearanceSettingsSection
                draft={draft}
                themeItems={themeItems}
                uiFontItems={uiFontItems}
                onUpdateEditor={updateEditor}
              />
            )}

            {activeSection === "editor" && (
              <EditorSettingsSection
                draft={draft}
                editorFontItems={editorFontItems}
                onApplyFontPreset={applyFontPreset}
                onUpdateEditor={updateEditor}
              />
            )}

            {activeSection === "ergonomics" && (
              <ErgonomicsSettingsSection
                draft={draft}
                onUpdateEditor={updateEditor}
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
                hasPythonWorkspace={hasPythonWorkspace}
                languageServerAction={languageServerAction}
                languageServerMessage={languageServerMessage}
                languageServers={languageServers}
                loadingLanguageServers={loadingLanguageServers}
                workspaceTrusted={workspaceTrusted}
                onClearPythonVirtualEnv={clearPythonVirtualEnv}
                onRefreshLanguageServers={() => void refreshLanguageServers()}
                onRunLanguageServerAction={(action) =>
                  void runLanguageServerAction(action)
                }
                onSelectPythonVirtualEnv={() => void selectPythonVirtualEnv()}
                onUpdateLsp={updateLsp}
                onViewLogs={onViewLogs}
              />
            )}

            {activeSection === "ai" && (
              <AxonAgentSettingsSection draft={draft} onUpdateAi={updateAi} />
            )}
          </div>

          <SettingsModalFooter
            dirty={dirty}
            onCancel={close}
            onReset={resetDraft}
            onSave={save}
          />
        </div>
      </div>
    </CommandModal>
  );
}
