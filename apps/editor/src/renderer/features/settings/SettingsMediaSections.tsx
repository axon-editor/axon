import { FolderOpen, Trash2, Upload } from "lucide-react";
import { type AxonSettings } from "../../../shared/settings";
import SearchSelect from "../search/SearchSelect";
import {
  EDITOR_BACKGROUND_IMAGE_FIT_ITEMS,
} from "./lib/settingsData";
import {
  SettingsField,
  SettingsNumberSlider,
  SettingsSection,
  SettingsTextInput,
  SettingsToggle,
} from "./SettingsControls";

type UpdateEditor = <K extends keyof AxonSettings["editor"]>(
  key: K,
  value: AxonSettings["editor"][K],
) => void;

export function BackgroundSettingsSection({
  backgroundImageError,
  draft,
  onSelectEditorBackgroundImage,
  onUpdateEditor,
}: {
  backgroundImageError: string | null;
  draft: AxonSettings;
  onSelectEditorBackgroundImage: () => void;
  onUpdateEditor: UpdateEditor;
}) {
  return (
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
          onChange={(checked) => onUpdateEditor("appTransparency", checked)}
          label={draft.editor.appTransparency ? "Enabled" : "Disabled"}
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
          onChange={(value) => onUpdateEditor("appBackgroundOpacity", value)}
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
          onChange={(value) => onUpdateEditor("appBackgroundBlur", value)}
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
              onClick={onSelectEditorBackgroundImage}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)]"
            >
              <FolderOpen size={13} />
              Choose image
            </button>
            <button
              type="button"
              onClick={() => onUpdateEditor("backgroundImagePath", "")}
              disabled={!draft.editor.backgroundImagePath}
              className="h-8 cursor-pointer rounded-md px-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[#2a1517] hover:text-[#ff7b72] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Clear
            </button>
          </div>
          <SettingsTextInput
            value={draft.editor.backgroundImagePath}
            onChange={(value) => onUpdateEditor("backgroundImagePath", value)}
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
          onChange={(value) => onUpdateEditor("backgroundImageOpacity", value)}
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
          onChange={(value) => onUpdateEditor("backgroundImageBlur", value)}
        />
      </SettingsField>

      <SettingsField
        label="Image fit"
        description="Controls how the image fills the editor surface."
      >
        <SearchSelect
          value={draft.editor.backgroundImageFit}
          items={EDITOR_BACKGROUND_IMAGE_FIT_ITEMS}
          onChange={(fit) => onUpdateEditor("backgroundImageFit", fit)}
          ariaLabel="Editor background image fit"
          placeholder="Search image fit..."
        />
      </SettingsField>
    </SettingsSection>
  );
}

export function FontsSettingsSection({
  draft,
  fontImportError,
  onImportFont,
  onRemoveFont,
  onUpdateEditor,
}: {
  draft: AxonSettings;
  fontImportError: string | null;
  onImportFont: () => void;
  onRemoveFont: (family: string) => void;
  onUpdateEditor: UpdateEditor;
}) {
  return (
    <SettingsSection
      title="Fonts"
      description="Import TTF, OTF, WOFF, or WOFF2 files into Axon storage, then use them for the UI, editor, terminal, and diff views."
    >
      <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
              Import font file
            </div>
            <div className="mt-1 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
              Axon copies imported fonts into app storage so the original file
              can move without breaking settings.
            </div>
          </div>
          <button
            type="button"
            onClick={onImportFont}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)]"
          >
            <Upload size={13} />
            Import
          </button>
        </div>
      </div>

      {draft.customFonts.length === 0 ? (
        <>
          <div className="rounded-md border border-dashed border-[var(--axon-panel-border)] px-4 py-8 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
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
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2"
            >
              <div className="min-w-0">
                <div
                  className="truncate text-[13px] text-[var(--axon-editor-foreground)]"
                  style={{ fontFamily: `"${font.family}", sans-serif` }}
                >
                  {font.family}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {font.path}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateEditor("uiFontFamily", font.family)}
                  className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
                >
                  UI
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateEditor("fontFamily", font.family)}
                  className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
                >
                  Editor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateEditor("uiFontFamily", font.family);
                    onUpdateEditor("fontFamily", font.family);
                  }}
                  className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveFont(font.family)}
                  aria-label={`Remove ${font.family}`}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[#2a1517] hover:text-[#ff7b72]"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
