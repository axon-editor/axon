import { type ReactNode } from "react";
import {
  Bot,
  Check,
  FolderOpen,
  Keyboard,
  Palette,
  Terminal,
} from "lucide-react";
import {
  BUILT_IN_THEME_IDS,
  THEME_LABELS,
  type BuiltInThemeId,
  type ThemeId,
} from "../../../shared/settings";
import { publicAsset } from "../../shared/lib/assets";

interface Props {
  currentThemeId: ThemeId;
  onOpenAgent: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onSelectTheme: (themeId: BuiltInThemeId) => void;
}

interface Action {
  id: string;
  icon: ReactNode;
  title: string;
  body: string;
  accent: string;
  onSelect: () => void;
}

function ActionButton({ action }: { action: Action }) {
  return (
    <button
      type="button"
      onClick={action.onSelect}
      className="group grid min-h-24 cursor-pointer grid-cols-[34px_minmax(0,1fr)] gap-3 bg-[var(--axon-panel-background)] p-3 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-md border"
        style={{
          borderColor: `${action.accent}55`,
          color: action.accent,
          background: `${action.accent}14`,
        }}
      >
        {action.icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">
          {action.title}
        </div>
        <div className="mt-1 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
          {action.body}
        </div>
      </div>
    </button>
  );
}

export default function WelcomeTab({
  currentThemeId,
  onOpenAgent,
  onOpenFolder,
  onOpenSettings,
  onOpenTerminal,
  onSelectTheme,
}: Props) {
  const actions: Action[] = [
    {
      id: "workspace",
      icon: <FolderOpen size={17} />,
      title: "Open the project",
      body: "Make the workspace the center of files, diagnostics, Git, terminal, and agent context.",
      accent: "#80c8e0",
      onSelect: onOpenFolder,
    },
    {
      id: "settings",
      icon: <Palette size={17} />,
      title: "Tune the editor",
      body: "Set theme, font, cursor, formatting, language tools, and workspace defaults.",
      accent: "#ffc777",
      onSelect: onOpenSettings,
    },
    {
      id: "agent",
      icon: <Bot size={17} />,
      title: "Work locally",
      body: "Use Axon Agent from the sidebar or terminal when the project needs local assistance.",
      accent: "#32bb99",
      onSelect: onOpenAgent,
    },
    {
      id: "terminal",
      icon: <Terminal size={17} />,
      title: "Keep tools close",
      body: "Run the shell, Git, diagnostics, and previews without breaking the editor flow.",
      accent: "#9d90fc",
      onSelect: onOpenTerminal,
    },
  ];

  return (
    <div className="@container/welcome h-full overflow-auto bg-[var(--axon-editor-background)] text-[var(--axon-editor-foreground)]">
      <div className="grid min-h-full w-full grid-cols-[minmax(220px,280px)_minmax(0,1fr)] @max-[760px]/welcome:grid-cols-1">
        <aside className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-5 md:border-b-0 md:border-r">
          <div className="w-fit select-none">
            <img
              src={publicAsset("axon.png")}
              alt=""
              draggable={false}
              className="h-12 w-12 object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
            />
            <div
              className="axon-welcome-word mt-2 text-[13px] font-semibold tracking-wide text-[var(--axon-editor-foreground)]"
              aria-label="Axon"
            >
              {"Axon".split("").map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 180}ms` }}
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <div className="text-[11px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
              welcome
            </div>
            <h1 className="mt-2 text-[28px] font-semibold leading-8 text-[var(--axon-editor-foreground)]">
              Welcome to Axon.
            </h1>
            <p className="mt-3 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-55">
              Start from the workspace, then shape the editor around how the
              project actually moves.
            </p>
          </div>

          <div className="mt-8 space-y-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
            {[
              { label: "Workspace first", onSelect: onOpenFolder },
              { label: "Local tools ready", onSelect: onOpenSettings },
              { label: "No cloud required", onSelect: onOpenAgent },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onSelect}
                className="flex cursor-pointer items-center gap-2 text-left transition-colors hover:text-[var(--axon-editor-foreground)] hover:opacity-100"
              >
                <Check size={13} className="text-[#32bb99]" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          <div
            className="grid gap-px bg-transparent"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
            }}
          >
            {actions.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
          </div>

          <div className="overflow-hidden border-t border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
            <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-[var(--axon-panel-border)]">
              <div className="flex items-center justify-center border-r border-[var(--axon-panel-border)] text-[var(--axon-editor-foreground)] opacity-45">
                <Keyboard size={15} />
              </div>
              <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
                fast entry points
              </div>
            </div>
            <div
              className="grid gap-px bg-transparent text-[11px]"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
              }}
            >
              {[
                ["Command palette", "Run commands and file search"],
                ["Problems", "Jump from diagnostics to code"],
                ["Source control", "Review changes without leaving Axon"],
              ].map(([title, body]) => (
                <div key={title} className="bg-[var(--axon-editor-background)] p-3">
                  <div className="font-medium text-[var(--axon-editor-foreground)]">{title}</div>
                  <div className="mt-1 leading-4 text-[var(--axon-editor-foreground)] opacity-55">{body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden border-t border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
            <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-[var(--axon-panel-border)]">
              <div className="flex items-center justify-center border-r border-[var(--axon-panel-border)] text-[var(--axon-editor-foreground)] opacity-45">
                <Palette size={15} />
              </div>
              <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
                choose a theme
              </div>
            </div>
            <div
              className="grid gap-px bg-transparent text-[11px]"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
              }}
            >
              {BUILT_IN_THEME_IDS.map((themeId) => {
                const selected = currentThemeId === themeId;
                return (
                  <button
                    key={themeId}
                    type="button"
                    onClick={() => onSelectTheme(themeId)}
                    className={`group flex cursor-pointer items-center gap-3 bg-[var(--axon-editor-background)] p-3 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)] ${
                      selected
                        ? "text-[var(--axon-editor-foreground)]"
                        : "text-[var(--axon-editor-foreground)] opacity-65"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                        selected
                          ? "border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]"
                          : "border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] opacity-45 group-hover:opacity-100"
                      }`}
                    >
                      {selected ? <Check size={14} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {THEME_LABELS[themeId]}
                      </span>
                      <span className="mt-0.5 block truncate text-[var(--axon-editor-foreground)] opacity-45">
                        Built into Axon
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[var(--axon-panel-border)] px-3 py-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
            This is a real editor tab, so it can be closed, moved, split, and
            restored like the rest of Axon.
          </div>
        </main>
      </div>
    </div>
  );
}
