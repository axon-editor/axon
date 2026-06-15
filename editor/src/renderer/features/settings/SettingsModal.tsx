import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  FolderOpen,
  Palette,
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
  EDITOR_FONT_ITEMS,
  FONT_PRESET_ITEMS,
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
  const [fontImportError, setFontImportError] = useState<string | null>(null);
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
    () =>
      draft.customFonts.map((font) => ({
        value: font.family,
        label: font.family,
        description: font.path,
      })),
    [draft.customFonts],
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

  const selectPythonVirtualEnv = async () => {
    setLanguageServerMessage(null);

    try {
      const selected = await window.axon.selectPythonVirtualEnv();
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
    <CommandModal title="settings" onClose={close} width="w-[920px]">
      <div className="grid h-[min(680px,calc(100vh-11.5rem))] grid-cols-[240px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[#222838] bg-[#0b0d13]">
          <div className="border-b border-[#222838] px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#dce4f0]">
              <Braces size={14} className="text-[#80c8e0]" />
              settings.json
            </div>
            <div className="mt-1 text-[11px] leading-4 text-[#586478]">
              UI changes save to Axon's app settings. Project settings stay
              manual unless you create them yourself.
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {SETTINGS_SECTIONS.map((section) => {
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
                  className={`flex w-full cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-[#1e2430] text-white"
                      : "text-[#9aa4b8] hover:bg-[#151923] hover:text-white"
                  }`}
                >
                  <Icon
                    size={14}
                    className={`mt-0.5 shrink-0 ${
                      hasError ? "text-[#ea6c73]" : "text-[#80c8e0]"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium">
                      {section.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-[#586478]">
                      {hasError
                        ? `${invalidThemeTokens.length} invalid color value${invalidThemeTokens.length === 1 ? "" : "s"}`
                        : section.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 flex-col bg-[#0e1018]">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                        disabled={!folderPath || languageServerAction !== null}
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
                title="AI"
                description="These defaults are not the full AI feature yet, but keeping them editable now means the provider layer can reuse the same settings contract later."
              >
                <SettingsField
                  label="Assistant"
                  description="Controls whether AI features should be available once wired."
                >
                  <SettingsToggle
                    checked={draft.ai.enabled}
                    onChange={(checked) => updateAi("enabled", checked)}
                    label={draft.ai.enabled ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

                <SettingsField label="Provider" description="Default AI provider.">
                  <SearchSelect
                    value={draft.ai.provider}
                    items={AI_PROVIDER_ITEMS}
                    onChange={(provider) => updateAi("provider", provider)}
                    ariaLabel="AI provider"
                    placeholder="Search providers..."
                  />
                </SettingsField>

                <SettingsField
                  label="Model"
                  description="Stored as text so newer models can be used without a UI release."
                >
                  <SettingsTextInput
                    value={draft.ai.model}
                    onChange={(value) => updateAi("model", value)}
                    placeholder="gpt-5.1"
                  />
                </SettingsField>

                <SettingsField
                  label="API key env"
                  description="Environment variable read by the future provider service."
                >
                  <SettingsTextInput
                    value={draft.ai.apiKeyEnv}
                    onChange={(value) => updateAi("apiKeyEnv", value)}
                    placeholder="OPENAI_API_KEY"
                    monospace
                  />
                </SettingsField>

                <SettingsField
                  label="Workspace context"
                  description="Allows future AI actions to include project files and search context."
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

          <div className="flex h-12 shrink-0 items-center justify-between border-t border-[#222838] px-4">
            <div className="text-[11px] text-[#586478]">
              {invalidThemeTokens.length > 0
                ? "Fix invalid theme colors before saving."
                : "Settings are normalized before they are written."}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#1e2430] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="h-8 cursor-pointer rounded-md border border-[#2a3346] bg-[#1e2430] px-3 text-[12px] text-[#c8d0e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:border-[#222838] disabled:text-[#586478]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </CommandModal>
  );
}
