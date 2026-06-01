import { useEffect, useMemo, useState } from "react";
import {
  Braces,
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
import { type LanguageServerStatus } from "../../../shared/lsp";
import CommandModal from "../CommandModal";
import SearchSelect from "../SearchSelect";
import {
  AI_PROVIDER_ITEMS,
  EDITOR_FONT_ITEMS,
  SETTINGS_SECTIONS,
  THEME_COLOR_LABELS,
  THEME_COLOR_TOKENS,
  THEME_ITEMS,
  THEME_LABELS,
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
  settings: AxonSettings;
  onClose: () => void;
  onSave: (settings: AxonSettings) => void;
}

const sectionIcons: Record<SettingsSectionId, typeof Palette> = {
  appearance: Palette,
  editor: Type,
  theme: Settings2,
  ai: Sparkles,
  fonts: Type,
  languageServers: Wifi,
};

function getThemeColorValue(
  settings: AxonSettings,
  token: ThemeColorToken,
) {
  const themeName = THEME_LABELS[settings.editor.themeId];
  return (
    settings.theme_overrides[themeName]?.[token] ??
    settings.theme_overrides[settings.editor.themeId]?.[token] ??
    ""
  );
}

export default function SettingsModal({
  folderPath,
  settings,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(settings);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("appearance");
  const [fontImportError, setFontImportError] = useState<string | null>(null);
  const [languageServers, setLanguageServers] = useState<
    LanguageServerStatus[]
  >([]);
  const [loadingLanguageServers, setLoadingLanguageServers] = useState(false);
  const [languageServerAction, setLanguageServerAction] = useState<
    "start" | "stop" | null
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
  const activeThemeName = THEME_LABELS[draft.editor.themeId];
  const invalidThemeTokens = useMemo(
    () =>
      THEME_COLOR_TOKENS.filter((token) => {
        const value = getThemeColorValue(draft, token);
        return value.trim().length > 0 && !isValidHexColor(value);
      }),
    [draft],
  );

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
    // is what axon.json already exposes. Keeping UI writes in that same shape
    // means users can move between the settings screen and raw JSON without
    // seeing duplicate override blocks for the same active theme.
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

  const runLanguageServerAction = async (action: "start" | "stop") => {
    if (!folderPath) return;

    setLanguageServerAction(action);
    setLanguageServerMessage(null);
    try {
      const result =
        action === "start"
          ? await window.axon.startLanguageServers(folderPath)
          : await window.axon.stopLanguageServers(folderPath);
      setLanguageServers(result.servers);
      setLanguageServerMessage(result.message);
    } catch (err) {
      console.error(`failed to ${action} language servers:`, err);
      setLanguageServerMessage(
        action === "start"
          ? "Failed to start language servers."
          : "Failed to stop language servers.",
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
      setActiveSection("theme");
      return;
    }

    onSave(normalizeSettings(draft));
    onClose();
  };

  return (
    <CommandModal title="settings" onClose={onClose} width="w-[920px]">
      <div className="grid h-[min(720px,calc(100vh-8rem))] grid-cols-[240px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[#222838] bg-[#0b0d13]">
          <div className="border-b border-[#222838] px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#dce4f0]">
              <Braces size={14} className="text-[#80c8e0]" />
              axon.json
            </div>
            <div className="mt-1 text-[11px] leading-4 text-[#586478]">
              UI changes save to the same normalized settings file.
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = sectionIcons[section.id];
              const active = section.id === activeSection;
              const hasError =
                section.id === "theme" && invalidThemeTokens.length > 0;

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
                    items={THEME_ITEMS}
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

            {activeSection === "theme" && (
              <SettingsSection
                title="Theme Colors"
                description={`Editing ${activeThemeName} overrides. Values accept #RRGGBB or #RRGGBBAA and are saved under theme_overrides in axon.json.`}
              >
                {THEME_COLOR_TOKENS.map((token) => {
                  const value = getThemeColorValue(draft, token);
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
                description="This is the service foundation for real project intelligence. Axon detects available servers now; the next LSP slice can start long-running clients from this same contract."
              >
                <SettingsField
                  label="LSP services"
                  description="Disabling this will let future LSP clients stay off even when servers are installed."
                >
                  <SettingsToggle
                    checked={draft.lsp.enabled}
                    onChange={(checked) => updateLsp("enabled", checked)}
                    label={draft.lsp.enabled ? "Enabled" : "Disabled"}
                  />
                </SettingsField>

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
                        onClick={() => void refreshLanguageServers()}
                        disabled={!folderPath || loadingLanguageServers}
                        className="h-7 cursor-pointer rounded px-2 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
                      >
                        {loadingLanguageServers ? "Checking..." : "Refresh"}
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
                      No language server status available yet.
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
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  server.running
                                    ? "bg-[#142a36] text-[#80c8e0]"
                                    : server.available
                                    ? "bg-[#15321f] text-[#90c8a0]"
                                    : "bg-[#2a1517] text-[#ff7b72]"
                                }`}
                              >
                                {server.running
                                  ? "running"
                                  : server.available
                                    ? "available"
                                    : "missing"}
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
                            <div className="mt-1 truncate font-mono text-[10px] text-[#3f485a]">
                              {server.command}
                            </div>
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
                onClick={onClose}
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
