import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  FolderOpen,
  Image,
  Keyboard,
  Palette,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Wifi,
} from "lucide-react";
import {
  normalizeSettings,
  type AxonSettings,
  type ThemeColorToken,
} from "../../../shared/settings";
import { type ExtensionState } from "../../../shared/extensions";
import { getThemeLabel } from "../../shared/themes";
import { type LanguageServerStatus } from "../../../shared/lsp";
import CommandModal from "../../shared/components/CommandModal";
import SearchSelect from "../search/SearchSelect";
import {
  AI_PROVIDER_ITEMS,
  EDITOR_SIDEBAR_SIDE_ITEMS,
  EDITOR_BACKGROUND_IMAGE_FIT_ITEMS,
  EDITOR_CURSOR_BLINKING_ITEMS,
  EDITOR_CURSOR_STYLE_ITEMS,
  EDITOR_FONT_ITEMS,
  FONT_PRESET_ITEMS,
  MULTI_CURSOR_MODIFIER_ITEMS,
  SETTINGS_SECTIONS,
  SYNTAX_THEME_COLOR_TOKENS,
  THEME_COLOR_LABELS,
  THEME_ITEMS,
  UI_THEME_COLOR_TOKENS,
  UI_FONT_ITEMS,
  type SettingsSectionId,
} from "./settingsData";
import {
  isValidHexColor,
  SettingsField,
  SettingsNumberSlider,
  SettingsSection,
  SettingsTextInput,
  SettingsToggle,
} from "./SettingsControls";

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

const sectionIcons: Record<SettingsSectionId, typeof Palette> = {
  appearance: Palette,
  editor: Type,
  ergonomics: Keyboard,
  background: Image,
  syntaxColors: Palette,
  theme: Settings2,
  ai: Sparkles,
  fonts: Type,
  languageServers: Wifi,
};

function getThemeColorValue(
  settings: AxonSettings,
  token: ThemeColorToken,
  extensionState: ExtensionState | null,
) {
  const extensionThemes =
    extensionState?.extensions.flatMap((extension) => extension.themes) ?? [];
  const themeName = getThemeLabel(settings.editor.themeId, extensionThemes);
  return (
    settings.theme_overrides[themeName]?.[token] ??
    settings.theme_overrides[settings.editor.themeId]?.[token] ??
    ""
  );
}

function getLanguageServerStatusLabel(server: LanguageServerStatus) {
  if (server.status === "failed") return "failed";
  if (server.status === "running") return "running";
  if (server.bundled && server.status === "available") return "bundled";
  if (server.status === "available") return "available";
  return "missing";
}

function getLanguageServerStatusClass(server: LanguageServerStatus) {
  if (server.status === "failed") return "bg-[#341b20] text-[#ff8b92]";
  if (server.status === "running") return "bg-[#142a36] text-[#80c8e0]";
  if (server.bundled) return "bg-[#15321f] text-[#90c8a0]";
  if (server.status === "available") return "bg-[#1c2636] text-[#9fb7e8]";
  return "bg-[#2a1517] text-[#ff7b72]";
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
    () =>
      extensionState?.extensions.flatMap((extension) =>
        extension.enabled ? extension.themes : [],
      ) ?? [],
    [extensionState],
  );
  const themeItems = useMemo(
    () => [
      ...THEME_ITEMS,
      ...extensionThemes.map((theme) => ({
        value: theme.id,
        label: theme.label,
        description: `${theme.extensionName} extension`,
      })),
    ],
    [extensionThemes],
  );
  const activeThemeName = getThemeLabel(draft.editor.themeId, extensionThemes);
  const invalidThemeTokens = useMemo(
    () =>
      [...UI_THEME_COLOR_TOKENS, ...SYNTAX_THEME_COLOR_TOKENS].filter((token) => {
        const value = getThemeColorValue(draft, token, extensionState);
        return value.trim().length > 0 && !isValidHexColor(value);
      }),
    [draft, extensionState],
  );
  const activeSectionMeta =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];
  const normalizedInitialSettings = useMemo(
    () => normalizeSettings(initialSettingsRef.current),
    [],
  );
  const normalizedDraft = normalizeSettings(draft);
  const dirty =
    JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedInitialSettings);
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
    if (invalidThemeTokens.length > 0) return;

    // Settings controls should feel like editor preferences, not a form that
    // only matters after closing the modal. I preview normalized settings here
    // so theme, chrome colors, UI font, Monaco font, terminal font, and panel
    // surfaces all update while the user is still choosing values.
    //
    // Invalid theme colors are intentionally not previewed. Without that guard
    // a half-typed value like "#00" could temporarily erase the active override
    // after normalization, which makes color editing feel jumpy and harder to
    // reason about.
    onPreview(normalizeSettings(draft));
  }, [draft, invalidThemeTokens.length, onPreview]);

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

  const updateThemeColor = (token: ThemeColorToken, value: string) => {
    // Theme overrides are stored by the human-facing theme label because that
    // is what the settings JSON already exposes. Keeping UI writes in that same
    // shape means users can move between the settings screen and raw JSON
    // without seeing duplicate override blocks for the same active theme.
    setDraft((prev) => ({
      ...prev,
      theme_overrides: {
        ...prev.theme_overrides,
        [activeThemeName]: {
          ...(prev.theme_overrides[activeThemeName] ?? {}),
          [token]: value,
        },
      },
    }));
  };

  const applyFontPreset = (presetId: AxonSettings["editor"]["fontPreset"]) => {
    const presetValues: Record<
      AxonSettings["editor"]["fontPreset"],
      Pick<
        AxonSettings["editor"],
        | "fontPreset"
        | "uiFontFamily"
        | "fontFamily"
        | "fontWeight"
        | "lineHeight"
        | "fontLigatures"
      > &
        Partial<Pick<AxonSettings["editor"], "fontSize">>
    > = {
      "axon-default": {
        fontPreset: "axon-default",
        uiFontFamily: ".AxonSans",
        fontFamily: ".AxonMono",
        fontWeight: 400,
        lineHeight: 22,
        fontLigatures: true,
      },
      "zed-like": {
        fontPreset: "zed-like",
        uiFontFamily: ".ZedSans",
        fontFamily: ".ZedMono",
        fontWeight: 400,
        lineHeight: 22,
        fontLigatures: true,
      },
      "jetbrains-mono": {
        fontPreset: "jetbrains-mono",
        uiFontFamily: ".AxonSans",
        fontFamily: "JetBrains Mono",
        fontWeight: 400,
        lineHeight: 23,
        fontLigatures: true,
      },
      "sf-mono": {
        fontPreset: "sf-mono",
        uiFontFamily: "SF Pro Text",
        fontFamily: "SF Mono",
        fontWeight: 400,
        lineHeight: 22,
        fontLigatures: false,
      },
      "fira-code": {
        fontPreset: "fira-code",
        uiFontFamily: ".AxonSans",
        fontFamily: "Fira Code",
        fontWeight: 400,
        lineHeight: 23,
        fontLigatures: true,
      },
      "geist-mono": {
        fontPreset: "geist-mono",
        uiFontFamily: "Inter",
        fontFamily: "Geist Mono",
        fontWeight: 400,
        lineHeight: 22,
        fontLigatures: false,
      },
      "cascadia-code": {
        fontPreset: "cascadia-code",
        uiFontFamily: ".AxonSans",
        fontFamily: "Cascadia Code",
        fontWeight: 400,
        lineHeight: 23,
        fontLigatures: true,
      },
      "berkeley-mono": {
        fontPreset: "berkeley-mono",
        uiFontFamily: ".AxonSans",
        fontFamily: "Berkeley Mono",
        fontWeight: 400,
        lineHeight: 22,
        fontLigatures: false,
      },
      "monaspace-neon-nerd": {
        fontPreset: "monaspace-neon-nerd",
        uiFontFamily: ".AxonSans",
        fontFamily: "Monaspace Neon NF",
        fontWeight: 400,
        lineHeight: 22,
        fontLigatures: true,
      },
      "apathy-ocean": {
        fontPreset: "apathy-ocean",
        uiFontFamily: ".AxonSans",
        fontFamily: "Monaspace Neon NF",
        fontSize: 11,
        fontWeight: 200,
        lineHeight: 18,
        fontLigatures: true,
      },
    };

    setDraft((prev) => ({
      ...prev,
      editor: {
        ...prev.editor,
        ...presetValues[presetId],
      },
    }));
  };

  const importFont = async () => {
    setFontImportError(null);

    try {
      const importedFont = await window.axon.importFont();
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
      const imagePath = await window.axon.selectEditorBackgroundImage();
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
      const selected = await window.axon.selectPythonVirtualEnv(folderPath);
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
      const nextServers = await window.axon.getLanguageServerStatus(folderPath);
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
        onSave(normalizeSettings(draft));
      }

      const result =
        action === "start"
          ? await window.axon.startLanguageServers(folderPath)
          : action === "stop"
            ? await window.axon.stopLanguageServers(folderPath)
            : await window.axon
                .stopLanguageServers(folderPath)
                .then(() => window.axon.startLanguageServers(folderPath));
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
    if (invalidThemeTokens.length > 0) {
      const hasInvalidSyntaxToken = invalidThemeTokens.some((token) =>
        token.startsWith("syntax."),
      );
      setActiveSection(hasInvalidSyntaxToken ? "syntaxColors" : "theme");
      return;
    }

    onSave(normalizeSettings(draft));
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

  return (
    <CommandModal
      onClose={close}
      width="w-[min(1080px,calc(100vw-2rem))]"
      bodyClassName="min-h-0 overflow-hidden"
    >
      <div className="grid h-[min(760px,calc(100vh-7.5rem))] min-h-0 grid-cols-[300px_1fr] overflow-hidden rounded-xl border border-[#343841] bg-[#101116] shadow-2xl">
        <aside className="flex min-h-0 flex-col border-r border-[#343841] bg-[#24262c]">
          <div className="shrink-0 border-b border-[#343841] px-4 py-4">
            <div className="flex items-center gap-2 rounded-md border border-[#3b3f48] bg-[#111319] px-3 py-2">
              <Search size={14} className="shrink-0 text-[#7b8089]" />
              <input
                value={sectionQuery}
                onChange={(event) => setSectionQuery(event.target.value)}
                placeholder="Search settings..."
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[#d7d9df] outline-none placeholder:text-[#777b84]"
              />
            </div>
            </div>

          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
            {filteredSections.map((section) => {
              const Icon = sectionIcons[section.id];
              const active = section.id === activeSection;
              const hasError =
                (section.id === "theme" || section.id === "syntaxColors") &&
                invalidThemeTokens.length > 0;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-[#343740] text-[#f2f3f5]"
                      : "text-[#a0a3aa] hover:bg-[#2d3037] hover:text-[#f2f3f5]"
                  }`}
                >
                  <Icon
                    size={14}
                    className={`shrink-0 ${
                      hasError ? "text-[#ea6c73]" : "text-[#9ca0aa]"
                    }`}
                  />
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {section.label}
                  </span>
                  {hasError ? (
                    <span className="ml-auto rounded-sm bg-[#4b2026] px-1.5 py-0.5 text-[10px] text-[#ff9ca2]">
                      {invalidThemeTokens.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {filteredSections.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-[#777b84]">
                No settings sections match that search.
              </div>
            ) : null}
          </nav>

          <div className="shrink-0 border-t border-[#343841] px-4 py-3 text-[11px] text-[#8a8d94]">
            {dirty ? "Unsaved changes" : "Settings saved"}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col bg-[#0d0f14]">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#2b2e36] px-7 py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[12px] text-[#8a8d94]">
                <span className="rounded bg-[#164163] px-2 py-0.5 text-[#7fc7ff]">
                  {folderPath ? "Workspace" : "User"}
                </span>
                <span className="truncate">{settingsScopeLabel}</span>
              </div>
              <h2 className="mt-8 text-[22px] font-semibold text-[#e5e7eb]">
                {activeSectionMeta.label}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#8f939b]">
                {activeSectionMeta.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft(initialSettingsRef.current);
                onPreview(initialSettingsRef.current);
              }}
              disabled={!dirty}
              className="hidden h-8 cursor-pointer items-center gap-2 rounded-md border border-[#30333b] bg-[#171920] px-3 text-[12px] text-[#c9cbd1] transition-colors hover:bg-[#20232b] hover:text-white disabled:cursor-not-allowed disabled:text-[#676b74] disabled:hover:bg-[#171920] md:flex"
            >
              <RotateCcw size={13} />
              Reset
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-[#8a8d94]">
              <Braces size={13} />
              <span>
                {folderPath
                  ? "Workspace settings inherit from user settings and can be overridden by axon.json."
                  : "No workspace is open, so changes apply to your user settings only."}
              </span>
            </div>

            {activeSection === "appearance" && (
              <SettingsSection
                title="Appearance"
                description="Choose the main Axon theme and the UI font used by the shell, sidebar, panels, and controls."
              >
                <SettingsField
                  label="Theme"
                  description="Applies to editor chrome, panels, terminal, and Monaco."
                >
                  <SearchSelect
                    value={draft.editor.themeId}
                    items={themeItems}
                    onChange={(themeId) => updateEditor("themeId", themeId)}
                    ariaLabel="Theme"
                    placeholder="Search themes..."
                  />
                </SettingsField>

                <SettingsField
                  label="UI font"
                  description="Controls Axon interface text outside the editor buffer."
                >
                  <SearchSelect
                    value={draft.editor.uiFontFamily}
                    items={uiFontItems}
                    onChange={(fontFamily) =>
                      updateEditor("uiFontFamily", fontFamily)
                    }
                    ariaLabel="UI font"
                    placeholder="Search UI fonts..."
                  />
                </SettingsField>

                <SettingsField
                  label="Sidebar side"
                  description="Moves the Files, History, and Spotify sidebar to the left or right of the editor."
                >
                  <SearchSelect
                    value={draft.editor.sidebarSide}
                    items={EDITOR_SIDEBAR_SIDE_ITEMS}
                    onChange={(side) => updateEditor("sidebarSide", side)}
                    ariaLabel="Main sidebar side"
                    placeholder="Search sides..."
                  />
                </SettingsField>
              </SettingsSection>
            )}

            {activeSection === "editor" && (
              <SettingsSection
                title="Editor"
                description="Tune the code editor typography. These values are normalized before saving so invalid JSON edits cannot push the editor outside usable bounds."
              >
                <SettingsField
                  label="Font preset"
                  description="Applies a complete editor/UI font style while keeping letter spacing at 0."
                >
                  <SearchSelect
                    value={draft.editor.fontPreset}
                    items={FONT_PRESET_ITEMS}
                    onChange={applyFontPreset}
                    ariaLabel="Font preset"
                    placeholder="Search font presets..."
                  />
                </SettingsField>

                <SettingsField
                  label="Editor font"
                  description="Default is Axon Mono, with common coding fonts available."
                >
                  <SearchSelect
                    value={draft.editor.fontFamily}
                    items={editorFontItems}
                    onChange={(fontFamily) =>
                      updateEditor("fontFamily", fontFamily)
                    }
                    ariaLabel="Editor font"
                    placeholder="Search editor fonts..."
                  />
                </SettingsField>

                <SettingsField label="Font size" description="Allowed range 10-28.">
                  <SettingsNumberSlider
                    min={10}
                    max={28}
                    value={draft.editor.fontSize}
                    onChange={(value) => updateEditor("fontSize", value)}
                  />
                </SettingsField>

                <SettingsField
                  label="Line height"
                  description="Allowed range 14-40."
                >
                  <SettingsNumberSlider
                    min={14}
                    max={40}
                    value={draft.editor.lineHeight}
                    onChange={(value) => updateEditor("lineHeight", value)}
                  />
                </SettingsField>

                <SettingsField
                  label="Font weight"
                  description="Allowed range 200-800. Letter spacing stays 0 for predictable code layout."
                >
                  <SettingsNumberSlider
                    min={200}
                    max={800}
                    step={50}
                    value={draft.editor.fontWeight}
                    onChange={(value) => updateEditor("fontWeight", value)}
                  />
                </SettingsField>

                <SettingsField
                  label="Ligatures"
                  description="Turns font ligatures on or off inside Monaco."
                >
                  <SettingsToggle
                    checked={draft.editor.fontLigatures}
                    onChange={(checked) =>
                      updateEditor("fontLigatures", checked)
                    }
                    label={draft.editor.fontLigatures ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                <SettingsField
                  label="Cursor style"
                  description="Controls the Monaco insertion cursor shape."
                >
                  <SearchSelect
                    value={draft.editor.cursorStyle}
                    items={EDITOR_CURSOR_STYLE_ITEMS}
                    onChange={(cursorStyle) =>
                      updateEditor("cursorStyle", cursorStyle)
                    }
                    ariaLabel="Cursor style"
                    placeholder="Search cursor styles..."
                  />
                </SettingsField>

                <SettingsField
                  label="Cursor blinking"
                  description="Controls the cursor animation. Blink, smooth, phase, expand, and solid are all supported; solid disables blinking."
                >
                  <SearchSelect
                    value={draft.editor.cursorBlinking}
                    items={EDITOR_CURSOR_BLINKING_ITEMS}
                    onChange={(cursorBlinking) =>
                      updateEditor("cursorBlinking", cursorBlinking)
                    }
                    ariaLabel="Cursor blinking"
                    placeholder="Search cursor blinking..."
                  />
                </SettingsField>
              </SettingsSection>
            )}

            {activeSection === "ergonomics" && (
              <SettingsSection
                title="Ergonomics"
                description="Control the editor behaviors that affect daily writing, navigation, and reading. Changes apply immediately so you can feel the difference without restarting Axon."
              >
                <SettingsField
                  label="Format on save"
                  description="Runs the active language server formatter before writing the file. Saving still succeeds if a formatter is unavailable."
                >
                  <SettingsToggle
                    checked={draft.editor.formatOnSave}
                    onChange={(checked) =>
                      updateEditor("formatOnSave", checked)
                    }
                    label={draft.editor.formatOnSave ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                <SettingsField
                  label="Snippets"
                  description="Shows Axon and language-server snippets in the completion popup."
                >
                  <SettingsToggle
                    checked={draft.editor.snippetsEnabled}
                    onChange={(checked) =>
                      updateEditor("snippetsEnabled", checked)
                    }
                    label={
                      draft.editor.snippetsEnabled ? "Enabled" : "Disabled"
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Emmet"
                  description="Expands common HTML and JSX abbreviations such as .card, button.primary, and section.hero."
                >
                  <SettingsToggle
                    checked={draft.editor.emmetEnabled}
                    onChange={(checked) => updateEditor("emmetEnabled", checked)}
                    label={draft.editor.emmetEnabled ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                <SettingsField
                  label="Multi-cursor modifier"
                  description="Choose the modifier used for adding cursors with mouse clicks."
                >
                  <SearchSelect
                    value={draft.editor.multiCursorModifier}
                    items={MULTI_CURSOR_MODIFIER_ITEMS}
                    onChange={(modifier) =>
                      updateEditor("multiCursorModifier", modifier)
                    }
                    ariaLabel="Multi-cursor modifier"
                    placeholder="Select modifier..."
                  />
                </SettingsField>

                <SettingsField
                  label="Breadcrumbs"
                  description="Shows the current file path and nearest symbol above the editor."
                >
                  <SettingsToggle
                    checked={draft.editor.breadcrumbsEnabled}
                    onChange={(checked) =>
                      updateEditor("breadcrumbsEnabled", checked)
                    }
                    label={
                      draft.editor.breadcrumbsEnabled ? "Enabled" : "Disabled"
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Sticky scroll"
                  description="Keeps the current scope visible at the top while scrolling through long files."
                >
                  <SettingsToggle
                    checked={draft.editor.stickyScrollEnabled}
                    onChange={(checked) =>
                      updateEditor("stickyScrollEnabled", checked)
                    }
                    label={
                      draft.editor.stickyScrollEnabled ? "Enabled" : "Disabled"
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Code folding"
                  description="Enables fold controls and folding keyboard commands."
                >
                  <SettingsToggle
                    checked={draft.editor.codeFoldingEnabled}
                    onChange={(checked) =>
                      updateEditor("codeFoldingEnabled", checked)
                    }
                    label={
                      draft.editor.codeFoldingEnabled ? "Enabled" : "Disabled"
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Minimap"
                  description="Shows a compact file map on the right side of the editor."
                >
                  <SettingsToggle
                    checked={draft.editor.minimapEnabled}
                    onChange={(checked) =>
                      updateEditor("minimapEnabled", checked)
                    }
                    label={draft.editor.minimapEnabled ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                <SettingsField
                  label="Scrollbar markers"
                  description="Shows diagnostics, search matches, and decorations in the overview ruler."
                >
                  <SettingsToggle
                    checked={draft.editor.scrollbarMarkersEnabled}
                    onChange={(checked) =>
                      updateEditor("scrollbarMarkersEnabled", checked)
                    }
                    label={
                      draft.editor.scrollbarMarkersEnabled
                        ? "Enabled"
                        : "Disabled"
                    }
                  />
                </SettingsField>
              </SettingsSection>
            )}

            {activeSection === "background" && (
              <SettingsSection
                title="Background"
                description="Control the app shell transparency and add a local image behind the code editor. The image path is saved in settings JSON and loaded through Axon's local file protocol."
              >
                <SettingsField
                  label="App transparency"
                  description="Lets the themed shell blend with the transparent native window instead of always painting an opaque app background."
                >
                  <SettingsToggle
                    checked={draft.editor.appTransparency}
                    onChange={(checked) =>
                      updateEditor("appTransparency", checked)
                    }
                    label={
                      draft.editor.appTransparency ? "Enabled" : "Disabled"
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="App opacity"
                  description="Allowed range 0.2-1. Text remains fully opaque; only the app background color changes."
                >
                  <SettingsNumberSlider
                    min={0.2}
                    max={1}
                    step={0.01}
                    value={draft.editor.appBackgroundOpacity}
                    onChange={(value) =>
                      updateEditor("appBackgroundOpacity", value)
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="App blur"
                  description="Allowed range 0-40px. This blurs what shows behind Axon's transparent app shell."
                >
                  <SettingsNumberSlider
                    min={0}
                    max={40}
                    step={1}
                    value={draft.editor.appBackgroundBlur}
                    onChange={(value) =>
                      updateEditor("appBackgroundBlur", value)
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Editor image"
                  description="Choose a local image to render behind the editor buffer."
                >
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void selectEditorBackgroundImage()}
                        className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#2a3346] bg-[#1e2430] px-3 text-[12px] text-[#c8d0e0] transition-colors hover:border-[#80c8e0] hover:text-white"
                      >
                        <FolderOpen size={13} />
                        Choose image
                      </button>
                      <button
                        type="button"
                        onClick={() => updateEditor("backgroundImagePath", "")}
                        disabled={!draft.editor.backgroundImagePath}
                        className="h-8 cursor-pointer rounded-md px-2 text-[12px] text-[#586478] transition-colors hover:bg-[#2a1517] hover:text-[#ff7b72] disabled:cursor-not-allowed disabled:text-[#364050] disabled:hover:bg-transparent"
                      >
                        Clear
                      </button>
                    </div>
                    <SettingsTextInput
                      value={draft.editor.backgroundImagePath}
                      onChange={(value) =>
                        updateEditor("backgroundImagePath", value)
                      }
                      placeholder="/absolute/path/to/background.png"
                      monospace
                    />
                    {backgroundImageError ? (
                      <div className="text-[11px] text-[#ea6c73]">
                        {backgroundImageError}
                      </div>
                    ) : null}
                  </div>
                </SettingsField>

                <SettingsField
                  label="Image opacity"
                  description="Allowed range 0-1. Keep this low so code stays readable."
                >
                  <SettingsNumberSlider
                    min={0}
                    max={1}
                    step={0.01}
                    value={draft.editor.backgroundImageOpacity}
                    onChange={(value) =>
                      updateEditor("backgroundImageOpacity", value)
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Image blur"
                  description="Allowed range 0-40px. Blur only affects the background image layer, not the editor text."
                >
                  <SettingsNumberSlider
                    min={0}
                    max={40}
                    step={1}
                    value={draft.editor.backgroundImageBlur}
                    onChange={(value) =>
                      updateEditor("backgroundImageBlur", value)
                    }
                  />
                </SettingsField>

                <SettingsField
                  label="Image fit"
                  description="Controls how the image fills the editor surface."
                >
                  <SearchSelect
                    value={draft.editor.backgroundImageFit}
                    items={EDITOR_BACKGROUND_IMAGE_FIT_ITEMS}
                    onChange={(fit) =>
                      updateEditor("backgroundImageFit", fit)
                    }
                    ariaLabel="Editor background image fit"
                    placeholder="Search image fit..."
                  />
                </SettingsField>
              </SettingsSection>
            )}

            {activeSection === "fonts" && (
              <SettingsSection
                title="Fonts"
                description="Import TTF, OTF, WOFF, or WOFF2 files into Axon storage, then use them for the UI, editor, terminal, and diff views."
              >
                <div className="rounded-md border border-[#222838] bg-[#0b0d13] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-[#dce4f0]">
                        Import font file
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-[#586478]">
                        Axon copies imported fonts into app storage so the
                        original file can move without breaking settings.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void importFont()}
                      className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#2a3346] bg-[#1e2430] px-3 text-[12px] text-[#c8d0e0] transition-colors hover:border-[#80c8e0] hover:text-white"
                    >
                      <Upload size={13} />
                      Import
                    </button>
                  </div>
                </div>

                {draft.customFonts.length === 0 ? (
                  <>
                    <div className="rounded-md border border-dashed border-[#222838] px-4 py-8 text-center text-[12px] text-[#586478]">
                      No custom fonts imported yet.
                    </div>
                    {fontImportError ? (
                      <div className="text-[12px] text-[#ea6c73]">
                        {fontImportError}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2">
                    {fontImportError ? (
                      <div className="text-[12px] text-[#ea6c73]">
                        {fontImportError}
                      </div>
                    ) : null}
                    {draft.customFonts.map((font) => (
                      <div
                        key={font.family}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-[#222838] bg-[#0b0d13] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-[13px] text-[#dce4f0]"
                            style={{
                              fontFamily: `"${font.family}", sans-serif`,
                            }}
                          >
                            {font.family}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-[#586478]">
                            {font.path}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateEditor("uiFontFamily", font.family)
                            }
                            className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
                          >
                            UI
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateEditor("fontFamily", font.family)
                            }
                            className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
                          >
                            Editor
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateEditor("uiFontFamily", font.family);
                              updateEditor("fontFamily", font.family);
                            }}
                            className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
                          >
                            Both
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFont(font.family)}
                            aria-label={`Remove ${font.family}`}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#2a1517] hover:text-[#ff7b72]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SettingsSection>
            )}

            {activeSection === "syntaxColors" && (
              <SettingsSection
                title="Syntax Colors"
                description={`Editing ${activeThemeName} syntax overrides. Values accept #RRGGBB or #RRGGBBAA and are saved under theme_overrides in settings JSON.`}
              >
                {SYNTAX_THEME_COLOR_TOKENS.map((token) => {
                  const value = getThemeColorValue(draft, token, extensionState);
                  const invalid =
                    value.trim().length > 0 && !isValidHexColor(value);
                  const colorValue = isValidHexColor(value)
                    ? value.slice(0, 7)
                    : "#000000";

                  return (
                    <SettingsField
                      key={token}
                      label={THEME_COLOR_LABELS[token]}
                      description={token}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={colorValue}
                          onChange={(event) =>
                            updateThemeColor(token, event.target.value)
                          }
                          className="h-8 w-10 cursor-pointer rounded border border-[#222838] bg-[#0e1018] p-1"
                          aria-label={`${THEME_COLOR_LABELS[token]} color`}
                        />
                        <SettingsTextInput
                          value={value}
                          onChange={(nextValue) =>
                            updateThemeColor(token, nextValue)
                          }
                          placeholder="#000000FF"
                          monospace
                        />
                      </div>
                      {invalid ? (
                        <div className="mt-1 text-[11px] text-[#ea6c73]">
                          Use #RRGGBB or #RRGGBBAA.
                        </div>
                      ) : null}
                    </SettingsField>
                  );
                })}
              </SettingsSection>
            )}

            {activeSection === "theme" && (
              <SettingsSection
                title="Theme Overrides"
                description={`Editing ${activeThemeName} UI overrides. Values accept #RRGGBB or #RRGGBBAA and are saved under theme_overrides in settings JSON.`}
              >
                {UI_THEME_COLOR_TOKENS.map((token) => {
                  const value = getThemeColorValue(draft, token, extensionState);
                  const invalid =
                    value.trim().length > 0 && !isValidHexColor(value);
                  const colorValue = isValidHexColor(value)
                    ? value.slice(0, 7)
                    : "#000000";

                  return (
                    <SettingsField
                      key={token}
                      label={THEME_COLOR_LABELS[token]}
                      description={token}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={colorValue}
                          onChange={(event) =>
                            updateThemeColor(token, event.target.value)
                          }
                          className="h-8 w-10 cursor-pointer rounded border border-[#222838] bg-[#0e1018] p-1"
                          aria-label={`${THEME_COLOR_LABELS[token]} color`}
                        />
                        <SettingsTextInput
                          value={value}
                          onChange={(nextValue) =>
                            updateThemeColor(token, nextValue)
                          }
                          placeholder="#000000FF"
                          monospace
                        />
                      </div>
                      {invalid ? (
                        <div className="mt-1 text-[11px] text-[#ea6c73]">
                          Use #RRGGBB or #RRGGBBAA.
                        </div>
                      ) : null}
                    </SettingsField>
                  );
                })}
              </SettingsSection>
            )}

            {activeSection === "languageServers" && (
              <SettingsSection
                title="Language Servers"
                description="Axon starts real language servers for project-aware completion, diagnostics, hover, references, rename, and formatting."
              >
                <SettingsField
                  label="LSP services"
                  description="Disabling this turns off external language intelligence while keeping Monaco's basic editor features."
                >
                  <SettingsToggle
                    checked={draft.lsp.enabled}
                    onChange={(checked) => updateLsp("enabled", checked)}
                    label={draft.lsp.enabled ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                {hasPythonWorkspace ? (
                  <SettingsField
                    label="Python virtual environment"
                    description="Optional. Python works without this, but select a project venv/interpreter when external packages like Django REST Framework need to resolve."
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void selectPythonVirtualEnv()}
                          disabled={!folderPath}
                          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#273044] bg-[#11151d] px-3 text-[12px] text-[#dce4f0] transition-colors hover:border-[#3b4660] hover:bg-[#171c27] disabled:cursor-not-allowed disabled:border-[#1c2230] disabled:text-[#465166]"
                        >
                          <FolderOpen size={14} />
                          Select venv
                        </button>
                        <button
                          type="button"
                          onClick={clearPythonVirtualEnv}
                          disabled={
                            !draft.lsp.pythonVirtualEnvPath &&
                            !draft.lsp.pythonInterpreterPath
                          }
                          className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[#8f9bb1] transition-colors hover:bg-[#171c27] hover:text-white disabled:cursor-not-allowed disabled:text-[#3d4658]"
                        >
                          Clear
                        </button>
                      </div>
                      <SettingsTextInput
                        value={draft.lsp.pythonVirtualEnvPath}
                        onChange={(value) =>
                          updateLsp("pythonVirtualEnvPath", value)
                        }
                        placeholder=".venv path"
                        monospace
                      />
                      <SettingsTextInput
                        value={draft.lsp.pythonInterpreterPath}
                        onChange={(value) =>
                          updateLsp("pythonInterpreterPath", value)
                        }
                        placeholder="Python interpreter path"
                        monospace
                      />
                    </div>
                  </SettingsField>
                ) : null}

                <div className="rounded-md border border-[#222838] bg-[#0b0d13]">
                  <div className="flex items-center justify-between border-b border-[#222838] px-3 py-2">
                    <div className="text-[12px] font-medium text-[#dce4f0]">
                      Workspace servers
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void runLanguageServerAction("start")}
                        disabled={
                          !folderPath ||
                          !draft.lsp.enabled ||
                          !workspaceTrusted ||
                          languageServerAction !== null
                        }
                        className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
                      >
                        {languageServerAction === "start"
                          ? "Starting..."
                          : "Start"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runLanguageServerAction("stop")}
                        disabled={
                          !folderPath ||
                          !workspaceTrusted ||
                          languageServerAction !== null
                        }
                        className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
                      >
                        {languageServerAction === "stop" ? "Stopping..." : "Stop"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runLanguageServerAction("restart")}
                        disabled={
                          !folderPath ||
                          !draft.lsp.enabled ||
                          !workspaceTrusted ||
                          languageServerAction !== null
                        }
                        className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
                      >
                        {languageServerAction === "restart"
                          ? "Restarting..."
                          : "Restart"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshLanguageServers()}
                        disabled={!folderPath || loadingLanguageServers}
                        className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
                      >
                        {loadingLanguageServers ? "Checking..." : "Refresh"}
                      </button>
                      <button
                        type="button"
                        onClick={onViewLogs}
                        className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
                      >
                        View logs
                      </button>
                    </div>
                  </div>

                  {languageServerMessage ? (
                    <div className="border-b border-[#222838] px-3 py-2 text-[11px] text-[#647086]">
                      {languageServerMessage}
                    </div>
                  ) : null}

                  {!folderPath ? (
                    <div className="px-3 py-4 text-[12px] text-[#586478]">
                      Open a workspace folder to detect language servers.
                    </div>
                  ) : languageServers.length === 0 && !loadingLanguageServers ? (
                    <div className="px-3 py-4 text-[12px] text-[#586478]">
                      No language server status is available yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#222838]">
                      {languageServers.map((server) => (
                        <div
                          key={server.id}
                          className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium text-[#dce4f0]">
                                {server.label}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] ${getLanguageServerStatusClass(server)}`}
                              >
                                {getLanguageServerStatusLabel(server)}
                              </span>
                              {server.relevant ? (
                                <span className="rounded bg-[#142a36] px-1.5 py-0.5 text-[10px] text-[#80c8e0]">
                                  workspace
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-[11px] leading-4 text-[#647086]">
                              {server.detail}
                            </div>
                            {server.lastError ? (
                              <div className="mt-1 text-[11px] leading-4 text-[#ff8b92]">
                                {server.lastError}
                              </div>
                            ) : null}
                            {server.runtimeRequirement ? (
                              <div className="mt-1 text-[11px] leading-4 text-[#8f9bb1]">
                                {server.runtimeRequirement}
                              </div>
                            ) : null}
                            <div className="mt-1 truncate font-mono text-[10px] text-[#3f485a]">
                              {server.command}
                            </div>
                            {server.runtimeHint ? (
                              <div className="mt-1 truncate font-mono text-[10px] text-[#60708c]">
                                {server.runtimeHint}
                              </div>
                            ) : null}
                          </div>
                          <div className="max-w-[220px] text-right text-[10px] leading-4 text-[#586478]">
                            {server.available
                              ? server.languages.join(", ")
                              : server.installHint}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SettingsSection>
            )}

            {activeSection === "ai" && (
              <SettingsSection
                title="Axon Agent"
                description="Local Axon models power project-aware chat, explanations, fixes, tests, diff review, and commit drafting without exposing third-party providers in the UI."
              >
                <SettingsField
                  label="Assistant"
                  description="Controls whether Axon Agent commands and the side panel are available."
                >
                  <SettingsToggle
                    checked={draft.ai.enabled}
                    onChange={(checked) => updateAi("enabled", checked)}
                    label={draft.ai.enabled ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                <SettingsField label="Provider" description="Local model runtime used by Axon Agent.">
                  <SearchSelect
                    value={draft.ai.provider}
                    items={AI_PROVIDER_ITEMS}
                    onChange={(provider) => updateAi("provider", provider)}
                    ariaLabel="Axon model provider"
                    placeholder="Search providers..."
                  />
                </SettingsField>

                <SettingsField
                  label="Model"
                  description="Axon model name. Advanced users can point this at another local model without changing the provider UI."
                >
                  <SettingsTextInput
                    value={draft.ai.model}
                    onChange={(value) => updateAi("model", value)}
                    placeholder="axon-code"
                  />
                </SettingsField>

                <SettingsField
                  label="Workspace context"
                  description="Allows Axon Agent actions to include active files, diagnostics, Git changes, and selected project context."
                >
                  <SettingsToggle
                    checked={draft.ai.includeWorkspaceContext}
                    onChange={(checked) =>
                      updateAi("includeWorkspaceContext", checked)
                    }
                    label={
                      draft.ai.includeWorkspaceContext ? "Included" : "Excluded"
                    }
                  />
                </SettingsField>
              </SettingsSection>
            )}
          </div>

          <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-[#1d2432] bg-[#0b0f17] px-5 py-3">
            <div className="min-w-0 text-[11px] text-[#647086]">
              {invalidThemeTokens.length > 0
                ? "Fix invalid theme colors before saving."
                : dirty
                  ? "Review and save to keep these settings."
                  : "Settings are normalized before they are written."}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(initialSettingsRef.current);
                  onPreview(initialSettingsRef.current);
                }}
                disabled={!dirty}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#3f485a] disabled:hover:bg-transparent md:hidden"
              >
                <RotateCcw size={13} />
                Reset
              </button>
              <button
                type="button"
                onClick={close}
                className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={invalidThemeTokens.length > 0 || !dirty}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#2f5f73] bg-[#142a36] px-3 text-[12px] text-[#dff7ff] transition-colors hover:bg-[#183345] hover:text-white disabled:cursor-not-allowed disabled:border-[#222838] disabled:bg-[#111722] disabled:text-[#586478]"
              >
                <Save size={13} />
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </CommandModal>
  );
}
