import { type AxonSettings } from "@axon-editor/shared/settings";
import SearchSelect, { type SearchSelectItem } from "@axon-editor/base/components/SearchSelect";
import {
  EDITOR_CURSOR_BLINKING_ITEMS,
  EDITOR_CURSOR_STYLE_ITEMS,
  FONT_PRESET_ITEMS,
} from "./lib/settingsData";
import {
  SettingsField,
  SettingsNumberSlider,
  SettingsSection,
  SettingsToggle,
} from "./SettingsControls";

export default function EditorSettingsSection({
  draft,
  editorFontItems,
  onApplyFontPreset,
  onUpdateEditor,
}: {
  draft: AxonSettings;
  editorFontItems: SearchSelectItem<string>[];
  onApplyFontPreset: (presetId: AxonSettings["editor"]["fontPreset"]) => void;
  onUpdateEditor: <K extends keyof AxonSettings["editor"]>(
    key: K,
    value: AxonSettings["editor"][K],
  ) => void;
}) {
  return (
    <SettingsSection
      title="Editor"
      description="Tune code typography, indentation, spacing, and visual nesting guides. Changes preview in open editors before you save them."
    >
      <SettingsField
        label="Font preset"
        description="Applies a complete editor/UI font style while keeping letter spacing at 0."
      >
        <SearchSelect
          value={draft.editor.fontPreset}
          items={FONT_PRESET_ITEMS}
          onChange={onApplyFontPreset}
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
          onChange={(fontFamily) => onUpdateEditor("fontFamily", fontFamily)}
          ariaLabel="Editor font"
          placeholder="Search editor fonts..."
        />
      </SettingsField>

      <SettingsField label="Font size" description="Allowed range 10-28.">
        <SettingsNumberSlider
          min={10}
          max={28}
          value={draft.editor.fontSize}
          onChange={(value) => onUpdateEditor("fontSize", value)}
        />
      </SettingsField>

      <SettingsField label="Line height" description="Allowed range 14-40.">
        <SettingsNumberSlider
          min={14}
          max={40}
          value={draft.editor.lineHeight}
          onChange={(value) => onUpdateEditor("lineHeight", value)}
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
          onChange={(value) => onUpdateEditor("fontWeight", value)}
        />
      </SettingsField>

      <SettingsField
        label="Ligatures"
        description="Turns font ligatures on or off inside Monaco."
      >
        <SettingsToggle
          checked={draft.editor.fontLigatures}
          onChange={(checked) => onUpdateEditor("fontLigatures", checked)}
          label={draft.editor.fontLigatures ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Tab size"
        description="Controls the width of each indentation level when automatic detection is disabled."
      >
        <SettingsNumberSlider
          min={1}
          max={8}
          value={draft.editor.tabSize}
          onChange={(value) => onUpdateEditor("tabSize", value)}
        />
      </SettingsField>

      <SettingsField
        label="Indent with spaces"
        description="Uses spaces for new indentation. Disable this to insert tab characters."
      >
        <SettingsToggle
          checked={draft.editor.insertSpaces}
          onChange={(checked) => onUpdateEditor("insertSpaces", checked)}
          label={draft.editor.insertSpaces ? "Spaces" : "Tabs"}
        />
      </SettingsField>

      <SettingsField
        label="Detect indentation"
        description="Lets Monaco infer indentation from each file. Disable it to enforce the selected tab size and spaces setting everywhere."
      >
        <SettingsToggle
          checked={draft.editor.detectIndentation}
          onChange={(checked) => onUpdateEditor("detectIndentation", checked)}
          label={draft.editor.detectIndentation ? "Automatic" : "Use my settings"}
        />
      </SettingsField>

      <SettingsField
        label="Code left spacing"
        description="Controls the layout-aware space between the line-number gutter and code. Set it to 0 for no extra space."
      >
        <SettingsNumberSlider
          min={0}
          max={64}
          value={draft.editor.codePaddingLeft}
          onChange={(value) => onUpdateEditor("codePaddingLeft", value)}
        />
      </SettingsField>

      <SettingsField
        label="Indentation guides"
        description="Shows or removes the straight vertical lines for indentation levels."
      >
        <SettingsToggle
          checked={draft.editor.indentationGuidesEnabled}
          onChange={(checked) =>
            onUpdateEditor("indentationGuidesEnabled", checked)
          }
          label={draft.editor.indentationGuidesEnabled ? "Visible" : "Hidden"}
        />
      </SettingsField>

      <SettingsField
        label="Active indentation guide"
        description="Highlights the indentation guide for the current cursor position."
      >
        <SettingsToggle
          checked={draft.editor.highlightActiveIndentationGuide}
          disabled={!draft.editor.indentationGuidesEnabled}
          onChange={(checked) =>
            onUpdateEditor("highlightActiveIndentationGuide", checked)
          }
          label={
            draft.editor.highlightActiveIndentationGuide
              ? "Highlighted"
              : "Not highlighted"
          }
        />
      </SettingsField>

      <SettingsField
        label="Bracket pair guides"
        description="Shows or removes vertical and horizontal guides connecting matching brackets."
      >
        <SettingsToggle
          checked={draft.editor.bracketPairGuidesEnabled}
          onChange={(checked) =>
            onUpdateEditor("bracketPairGuidesEnabled", checked)
          }
          label={draft.editor.bracketPairGuidesEnabled ? "Visible" : "Hidden"}
        />
      </SettingsField>

      <SettingsField
        label="Cursor style"
        description="Controls the Monaco insertion cursor shape."
      >
        <SearchSelect
          value={draft.editor.cursorStyle}
          items={EDITOR_CURSOR_STYLE_ITEMS}
          onChange={(cursorStyle) => onUpdateEditor("cursorStyle", cursorStyle)}
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
            onUpdateEditor("cursorBlinking", cursorBlinking)
          }
          ariaLabel="Cursor blinking"
          placeholder="Search cursor blinking..."
        />
      </SettingsField>
    </SettingsSection>
  );
}
