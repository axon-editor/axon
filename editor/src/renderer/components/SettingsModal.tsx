import { useState } from "react";
import CommandModal from "./CommandModal";
import SearchSelect, { type SearchSelectItem } from "./SearchSelect";
import {
  AI_PROVIDER_IDS,
  BUILT_IN_THEME_IDS,
  type AiProviderId,
  type AxonSettings,
  type BuiltInThemeId,
} from "../../shared/settings";

const THEME_LABELS: Record<BuiltInThemeId, string> = {
  "axon-dark": "Axon Dark",
  sora: "Sora",
  "catppuccin-mocha": "Catppuccin Mocha",
  "tokyo-night": "Tokyo Night",
};

const THEME_ITEMS: SearchSelectItem<BuiltInThemeId>[] = BUILT_IN_THEME_IDS.map(
  (themeId) => ({
    value: themeId,
    label: THEME_LABELS[themeId],
  }),
);

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

          <label className="text-[12px] text-[#9aa4b8]">font family</label>
          <input
            value={draft.editor.fontFamily}
            onChange={(e) => updateEditor("fontFamily", e.target.value)}
            className="h-8 bg-[#0e1018] border border-[#222838] rounded px-2 text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
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
