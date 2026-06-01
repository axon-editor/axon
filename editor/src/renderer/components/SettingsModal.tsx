import { useState } from "react";
import CommandModal from "./CommandModal";
import SearchSelect, { type SearchSelectItem } from "./SearchSelect";
import {
  AI_PROVIDER_IDS,
  BUILT_IN_THEME_IDS,
  EDITOR_FONT_FAMILIES,
  THEME_COLOR_TOKENS,
  THEME_LABELS,
  UI_FONT_FAMILIES,
  type AiProviderId,
  type AxonSettings,
  type BuiltInThemeId,
  type EditorFontFamily,
  type ThemeColorToken,
  type UiFontFamily,
} from "../../shared/settings";

const THEME_ITEMS: SearchSelectItem<BuiltInThemeId>[] = BUILT_IN_THEME_IDS.map(
  (themeId) => ({
    value: themeId,
    label: THEME_LABELS[themeId],
  }),
);

const UI_FONT_ITEMS: SearchSelectItem<UiFontFamily>[] = UI_FONT_FAMILIES.map(
  (fontFamily) => ({
    value: fontFamily,
    label: fontFamily,
  }),
);

const EDITOR_FONT_ITEMS: SearchSelectItem<EditorFontFamily>[] =
  EDITOR_FONT_FAMILIES.map((fontFamily) => ({
    value: fontFamily,
    label: fontFamily,
  }));

const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: "OpenAI",
  local: "Local",
};

const AI_PROVIDER_ITEMS: SearchSelectItem<AiProviderId>[] = AI_PROVIDER_IDS.map(
  (provider) => ({
    value: provider,
    label: AI_PROVIDER_LABELS[provider],
  }),
);

const THEME_COLOR_LABELS: Record<ThemeColorToken, string> = {
  background: "app background",
  "status_bar.background": "status bar",
  "title_bar.background": "title bar",
  "toolbar.background": "toolbar",
  "sidebar.background": "sidebar",
  "sidebar.border": "sidebar border",
  "tab.active_background": "active tab",
  "panel.background": "panel",
  "panel.border": "panel border",
  "panel.overlay_hover": "panel hover",
  "editor.foreground": "editor text",
  "editor.background": "editor background",
  "editor.gutter.background": "editor gutter",
  "terminal.background": "terminal background",
  "terminal.foreground": "terminal text",
};

interface Props {
  settings: AxonSettings;
  onClose: () => void;
  onSave: (settings: AxonSettings) => void;
}

export default function SettingsModal({ settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings);

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

  const updateThemeColor = (token: ThemeColorToken, value: string) => {
    const themeName = THEME_LABELS[draft.editor.themeId];

    setDraft((prev) => ({
      ...prev,
      theme_overrides: {
        ...prev.theme_overrides,
        [themeName]: {
          ...(prev.theme_overrides[themeName] ?? {}),
          [token]: value,
        },
      },
    }));
  };

  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <CommandModal title="settings" onClose={onClose} width="w-[560px]">
      <div className="max-h-[calc(100vh-12rem)] space-y-5 overflow-y-auto p-4">
        <div className="grid grid-cols-[150px_1fr] items-center gap-3">
          <div className="col-span-2 text-[11px] font-medium uppercase tracking-normal text-[#586478]">
            editor
          </div>

          <label className="text-[12px] text-[#9aa4b8]">theme</label>
          <SearchSelect
            value={draft.editor.themeId}
            items={THEME_ITEMS}
            onChange={(themeId) => updateEditor("themeId", themeId)}
            ariaLabel="Theme"
            placeholder="Search themes..."
          />

          <label className="text-[12px] text-[#9aa4b8]">ui font</label>
          <SearchSelect
            value={draft.editor.uiFontFamily as UiFontFamily}
            items={UI_FONT_ITEMS}
            onChange={(fontFamily) => updateEditor("uiFontFamily", fontFamily)}
            ariaLabel="UI font"
            placeholder="Search UI fonts..."
          />

          <label className="text-[12px] text-[#9aa4b8]">editor font</label>
          <SearchSelect
            value={draft.editor.fontFamily as EditorFontFamily}
            items={EDITOR_FONT_ITEMS}
            onChange={(fontFamily) => updateEditor("fontFamily", fontFamily)}
            ariaLabel="Editor font"
            placeholder="Search editor fonts..."
          />

          <label className="text-[12px] text-[#9aa4b8]">font size</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={28}
              value={draft.editor.fontSize}
              onChange={(e) =>
                updateEditor("fontSize", Number(e.target.value))
              }
              className="flex-1 accent-[#80c8e0]"
            />
            <input
              type="number"
              min={10}
              max={28}
              value={draft.editor.fontSize}
              onChange={(e) =>
                updateEditor("fontSize", Number(e.target.value))
              }
              className="w-16 h-8 bg-[#0e1018] border border-[#222838] rounded px-2 text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
            />
          </div>

          <label className="text-[12px] text-[#9aa4b8]">line height</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={14}
              max={40}
              value={draft.editor.lineHeight}
              onChange={(e) =>
                updateEditor("lineHeight", Number(e.target.value))
              }
              className="flex-1 accent-[#80c8e0]"
            />
            <input
              type="number"
              min={14}
              max={40}
              value={draft.editor.lineHeight}
              onChange={(e) =>
                updateEditor("lineHeight", Number(e.target.value))
              }
              className="w-16 h-8 bg-[#0e1018] border border-[#222838] rounded px-2 text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
            />
          </div>

          <label className="text-[12px] text-[#9aa4b8]">ligatures</label>
          <label className="flex items-center gap-2 text-[12px] text-[#c8d0e0]">
            <input
              type="checkbox"
              checked={draft.editor.fontLigatures}
              onChange={(e) =>
                updateEditor("fontLigatures", e.target.checked)
              }
              className="accent-[#80c8e0]"
            />
            enabled
          </label>
        </div>

        <div className="grid grid-cols-[150px_1fr] items-center gap-3 border-t border-[#222838] pt-4">
          <div className="col-span-2 text-[11px] font-medium uppercase tracking-normal text-[#586478]">
            theme overrides
          </div>

          <div className="col-span-2 text-[12px] leading-5 text-[#647086]">
            Editing {THEME_LABELS[draft.editor.themeId]} colors. Values are
            saved into axon.json under theme_overrides.
          </div>

          {THEME_COLOR_TOKENS.map((token) => {
            const themeName = THEME_LABELS[draft.editor.themeId];
            const value =
              draft.theme_overrides[themeName]?.[token] ??
              draft.theme_overrides[draft.editor.themeId]?.[token] ??
              "";

            return (
              <div
                key={token}
                className="col-span-2 grid grid-cols-[150px_1fr] items-center gap-3"
              >
                <label className="text-[12px] text-[#9aa4b8]">
                  {THEME_COLOR_LABELS[token]}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000"}
                    onChange={(e) => updateThemeColor(token, e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-[#222838] bg-[#0e1018] p-1"
                    aria-label={`${THEME_COLOR_LABELS[token]} color`}
                  />
                  <input
                    value={value}
                    onChange={(e) => updateThemeColor(token, e.target.value)}
                    placeholder="#000000FF"
                    className="h-8 flex-1 rounded border border-[#222838] bg-[#0e1018] px-2 font-mono text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[150px_1fr] items-center gap-3 border-t border-[#222838] pt-4">
          <div className="col-span-2 text-[11px] font-medium uppercase tracking-normal text-[#586478]">
            ai
          </div>

          <label className="text-[12px] text-[#9aa4b8]">assistant</label>
          <label className="flex items-center gap-2 text-[12px] text-[#c8d0e0]">
            <input
              type="checkbox"
              checked={draft.ai.enabled}
              onChange={(e) => updateAi("enabled", e.target.checked)}
              className="accent-[#80c8e0]"
            />
            enabled
          </label>

          <label className="text-[12px] text-[#9aa4b8]">provider</label>
          <SearchSelect
            value={draft.ai.provider}
            items={AI_PROVIDER_ITEMS}
            onChange={(provider) => updateAi("provider", provider)}
            ariaLabel="AI provider"
            placeholder="Search providers..."
          />

          <label className="text-[12px] text-[#9aa4b8]">model</label>
          <input
            value={draft.ai.model}
            onChange={(e) => updateAi("model", e.target.value)}
            className="h-8 bg-[#0e1018] border border-[#222838] rounded px-2 text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
          />

          <label className="text-[12px] text-[#9aa4b8]">api key env</label>
          <input
            value={draft.ai.apiKeyEnv}
            onChange={(e) => updateAi("apiKeyEnv", e.target.value)}
            className="h-8 bg-[#0e1018] border border-[#222838] rounded px-2 text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
          />

          <label className="text-[12px] text-[#9aa4b8]">workspace context</label>
          <label className="flex items-center gap-2 text-[12px] text-[#c8d0e0]">
            <input
              type="checkbox"
              checked={draft.ai.includeWorkspaceContext}
              onChange={(e) =>
                updateAi("includeWorkspaceContext", e.target.checked)
              }
              className="accent-[#80c8e0]"
            />
            include files and search context
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#222838] pt-4">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded text-[12px] text-[#9aa4b8] hover:text-white hover:bg-[#1e2430] transition-colors cursor-pointer"
          >
            cancel
          </button>
          <button
            onClick={save}
            className="h-8 px-3 rounded bg-[#1e2430] text-[12px] text-[#c8d0e0] hover:text-white border border-[#222838] hover:border-[#80c8e0] transition-colors cursor-pointer"
          >
            save
          </button>
        </div>
      </div>
    </CommandModal>
  );
}
