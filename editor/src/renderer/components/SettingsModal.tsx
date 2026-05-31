import { useState } from "react";
import CommandModal from "./CommandModal";
import {
  BUILT_IN_THEME_IDS,
  type AxonSettings,
  type BuiltInThemeId,
} from "../../shared/settings";

const THEME_LABELS: Record<BuiltInThemeId, string> = {
  "axon-dark": "Axon Dark",
  sora: "Sora",
  "catppuccin-mocha": "Catppuccin Mocha",
  "tokyo-night": "Tokyo Night",
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

  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <CommandModal title="settings" onClose={onClose} width="w-[560px]">
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-[150px_1fr] items-center gap-3">
          <label className="text-[12px] text-[#9aa4b8]">theme</label>
          <select
            value={draft.editor.themeId}
            onChange={(e) =>
              updateEditor("themeId", e.target.value as BuiltInThemeId)
            }
            className="h-8 bg-[#0e1018] border border-[#222838] rounded px-2 text-[12px] text-[#c8d0e0] outline-none focus:border-[#80c8e0]"
          >
            {BUILT_IN_THEME_IDS.map((themeId) => (
              <option key={themeId} value={themeId}>
                {THEME_LABELS[themeId]}
              </option>
            ))}
          </select>

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
