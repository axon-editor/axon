import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Bot,
  Command,
  FileCode2,
  FolderOpen,
  GitBranch,
  Info,
  ListChecks,
  Menu,
  PanelBottom,
  PlaySquare,
  Save,
  Search,
  Settings,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { AXON_COMMANDS, type AxonCommand } from "../../../shared/commands";
import Tooltip from "../../../renderer/shared/components/Tooltip";

interface AppMenuAction {
  id: string;
  label: string;
  detail: string;
  icon: typeof Menu;
  command: AxonCommand;
}

interface AppMenuSection {
  title: string;
  actions: AppMenuAction[];
}

interface Props {
  hasWorkspace: boolean;
  onCommand: (command: AxonCommand) => void;
}

export default function AppMenuButton({ hasWorkspace, onCommand }: Props) {
  const [open, setOpen] = useState(false);
  const sections = useMemo<AppMenuSection[]>(
    () => [
      {
        title: "File",
        actions: [
          {
            id: "new-file",
            label: "New File",
            detail: "Create a file in the workspace",
            icon: FileCode2,
            command: AXON_COMMANDS.NEW_FILE,
          },
          {
            id: "open-folder",
            label: "Open Folder",
            detail: "Choose a project folder",
            icon: FolderOpen,
            command: AXON_COMMANDS.OPEN_FOLDER,
          },
          {
            id: "settings",
            label: "Settings",
            detail: "Editor, AI, themes, and language servers",
            icon: Settings,
            command: AXON_COMMANDS.OPEN_SETTINGS,
          },
          {
            id: "save",
            label: "Save",
            detail: "Write the active file to disk",
            icon: Save,
            command: AXON_COMMANDS.SAVE,
          },
          {
            id: "close-tab",
            label: "Close Tab",
            detail: "Close the active editor tab",
            icon: FileCode2,
            command: AXON_COMMANDS.CLOSE_TAB,
          },
        ],
      },
      {
        title: "Navigate",
        actions: [
          {
            id: "command-palette",
            label: "Command Palette",
            detail: "Run any Axon command",
            icon: Command,
            command: AXON_COMMANDS.OPEN_COMMAND_PALETTE,
          },
          {
            id: "workspace-search",
            label: "Workspace Search",
            detail: "Find text across the project",
            icon: Search,
            command: AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
          },
          {
            id: "problems",
            label: "Problems",
            detail: "Review diagnostics in the bottom panel",
            icon: PanelBottom,
            command: AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
          },
        ],
      },
      {
        title: "Tools",
        actions: [
          {
            id: "terminal",
            label: "Terminal",
            detail: "Toggle the integrated terminal",
            icon: SquareTerminal,
            command: AXON_COMMANDS.TOGGLE_TERMINAL,
          },
          {
            id: "source-control",
            label: "Source Control",
            detail: "Open Git changes and history",
            icon: GitBranch,
            command: AXON_COMMANDS.OPEN_SOURCE_CONTROL,
          },
          {
            id: "tests",
            label: "Tests",
            detail: "Open project-aware test explorer",
            icon: PlaySquare,
            command: AXON_COMMANDS.OPEN_TEST_EXPLORER,
          },
          {
            id: "extensions",
            label: "Extensions",
            detail: "Manage themes and built-in extensions",
            icon: Wrench,
            command: AXON_COMMANDS.OPEN_EXTENSIONS,
          },
          {
            id: "agent",
            label: "Ask Axon",
            detail: "Open the agent with editor context",
            icon: Bot,
            command: AXON_COMMANDS.ASK_AXON,
          },
        ],
      },
      {
        title: "Help",
        actions: [
          {
            id: "about",
            label: "About Axon",
            detail: "Version, platform, and build details",
            icon: Info,
            command: AXON_COMMANDS.ABOUT,
          },
          {
            id: "language-tools",
            label: "Language Tools",
            detail: "Inspect language servers and editor support",
            icon: ListChecks,
            command: AXON_COMMANDS.OPEN_LANGUAGE_TOOLS,
          },
        ],
      },
    ],
    [],
  );

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const runAction = (command: AxonCommand) => {
    setOpen(false);
    onCommand(command);
  };

  return (
    <div className="relative" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
      <Tooltip label="Axon menu" side="bottom">
        <button
          type="button"
          aria-label="Open Axon menu"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          className="ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-transparent text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:border-[var(--axon-panel-border)] hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <Menu size={16} />
        </button>
      </Tooltip>

      {open ? (
        <div
          className="absolute left-1 top-9 z-[80] w-[320px] overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] py-2 shadow-[0_20px_70px_rgba(0,0,0,0.42)]"
          style={{ animation: "axonContextIn 120ms ease-out" }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {sections.map((section) => (
            <div key={section.title} className="px-2 py-1">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-35">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.actions.map((action) => {
                  const Icon = action.icon;
                  const disabled =
                    !hasWorkspace &&
                    action.command !== AXON_COMMANDS.OPEN_FOLDER &&
                    action.command !== AXON_COMMANDS.OPEN_COMMAND_PALETTE &&
                    action.command !== AXON_COMMANDS.OPEN_SETTINGS &&
                    action.command !== AXON_COMMANDS.ABOUT;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => runAction(action.command)}
                      className="grid w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5 text-left text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Icon size={14} className="mt-0.5 opacity-65" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium">
                          {action.label}
                        </span>
                        <span className="block truncate text-[10px] opacity-45">
                          {action.detail}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
