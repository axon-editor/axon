import {
  Image,
  Keyboard,
  Palette,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Type,
  Wifi,
} from "lucide-react";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "./lib/settingsData";

const sectionIcons: Record<SettingsSectionId, typeof Palette> = {
  appearance: Palette,
  editor: Type,
  ergonomics: Keyboard,
  background: Image,
  ai: Sparkles,
  fonts: Type,
  languageServers: Wifi,
};

export function SettingsModalSidebar({
  activeSection,
  dirty,
  filteredSections,
  sectionQuery,
  onSectionChange,
  onSectionQueryChange,
}: {
  activeSection: SettingsSectionId;
  dirty: boolean;
  filteredSections: typeof SETTINGS_SECTIONS;
  sectionQuery: string;
  onSectionChange: (section: SettingsSectionId) => void;
  onSectionQueryChange: (query: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--axon-panel-border)] bg-[var(--axon-sidebar-background)]">
      <div className="shrink-0 border-b border-[var(--axon-panel-border)] px-4 py-4">
        <div className="flex items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2">
          <Search size={14} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
          <input
            value={sectionQuery}
            onChange={(event) => onSectionQueryChange(event.target.value)}
            placeholder="Search settings..."
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-40"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {filteredSections.map((section) => {
          const Icon = sectionIcons[section.id];
          const active = section.id === activeSection;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                active
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
              }`}
            >
              <Icon
                size={14}
                className="shrink-0 text-[#9ca0aa]"
              />
              <span className="min-w-0 truncate text-[13px] font-medium">
                {section.label}
              </span>
            </button>
          );
        })}
        {filteredSections.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[#777b84]">
            No settings sections match that search.
          </div>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-[var(--axon-panel-border)] px-4 py-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
        {dirty ? "Unsaved changes" : "Settings saved"}
      </div>
    </aside>
  );
}

export function SettingsModalHeader({
  activeSectionMeta,
  dirty,
  folderPath,
  settingsScopeLabel,
  onReset,
}: {
  activeSectionMeta: (typeof SETTINGS_SECTIONS)[number];
  dirty: boolean;
  folderPath: string | null;
  settingsScopeLabel: string;
  onReset: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--axon-panel-border)] px-7 py-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
          <span className="rounded bg-[#164163] px-2 py-0.5 text-[#7fc7ff]">
            {folderPath ? "Workspace" : "User"}
          </span>
          <span className="truncate">{settingsScopeLabel}</span>
        </div>
        <h2 className="mt-8 text-[22px] font-semibold text-[var(--axon-editor-foreground)]">
          {activeSectionMeta.label}
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-65">
          {activeSectionMeta.description}
        </p>
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={!dirty}
        className="hidden h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-[var(--axon-editor-background)] md:flex"
      >
        <RotateCcw size={13} />
        Reset
      </button>
    </div>
  );
}

export function SettingsModalFooter({
  dirty,
  onCancel,
  onReset,
  onSave,
}: {
  dirty: boolean;
  onCancel: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-5 py-3">
      <div className="min-w-0 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
        {dirty
          ? "Review and save to keep these settings."
          : "Settings are normalized before they are written."}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty}
          className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent md:hidden"
        >
          <RotateCcw size={13} />
          Reset
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:border-[var(--axon-panel-border)] disabled:bg-transparent disabled:opacity-45"
        >
          <Save size={13} />
          Save
        </button>
      </div>
    </div>
  );
}
