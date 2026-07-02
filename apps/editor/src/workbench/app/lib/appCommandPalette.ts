import { AXON_COMMANDS } from "../../../shared/commands";
import { isHtmlFile } from "../../../renderer/features/preview/lib/htmlPreviewTabs";
import { type CommandPaletteCommand } from "../../../renderer/features/search/CommandPalette";

interface BuildAppPaletteCommandsOptions {
  activeFilePath: string | null;
  activeFileSymbolCount: number;
  diagnosticsCount: number;
  extensionState: any;
  folderPath: string | null;
  gitChangeCount: number;
  language: string;
  settings: any;
  terminalOpen: boolean;
  updateInfo: any;
  workspaceRootCount: number;
  workspaceTrusted: boolean;
  zenMode: boolean;
}

export function buildAppPaletteCommands({
  activeFilePath,
  activeFileSymbolCount,
  diagnosticsCount,
  extensionState,
  folderPath,
  gitChangeCount,
  language,
  settings,
  terminalOpen,
  updateInfo,
  workspaceRootCount,
  workspaceTrusted,
  zenMode,
}: BuildAppPaletteCommandsOptions): CommandPaletteCommand[] {
    const extensionCommands =
      extensionState?.extensions.flatMap((extension: any) =>
        extension.enabled
          ? extension.contributes.commands.map((command: any) => ({
              id: `extension:${command.id}` as const,
              title: command.title,
              group: command.category ?? "Extensions",
              subtitle: !workspaceTrusted
                ? "Trust this workspace before running extension commands"
                : (command.description ??
                  `${extension.name} command contribution`),
              keywords: [extension.name, extension.publisher, command.id],
              disabled: !workspaceTrusted,
            }))
          : [],
      ) ?? [];

    return [
      {
        id: AXON_COMMANDS.NEW_FILE,
        title: "New File",
        group: "File",
        shortcut: "Cmd N",
        subtitle: folderPath
          ? "Create a file in the current workspace"
          : "Open a folder first",
        keywords: ["create", "untitled"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_FOLDER,
        title: "Open Folder",
        group: "File",
        shortcut: "Cmd O",
        subtitle: "Choose another workspace folder",
        keywords: ["workspace", "project"],
      },
      {
        id: AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
        title: "Search Workspace",
        group: "Search",
        shortcut: "Cmd Shift F",
        subtitle: folderPath
          ? "Search text across the current folder"
          : "Open a folder first",
        keywords: ["find", "grep"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_WORKSPACE_OVERVIEW,
        title: "Workspace Overview",
        group: "Workspace",
        subtitle:
          workspaceRootCount > 1
            ? `${workspaceRootCount} workspace roots`
            : folderPath
              ? "Show root status, problems, tests, and Git"
              : "Open a folder first",
        keywords: ["workspace", "roots", "multi-root", "project"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_TASK_RUNNER,
        title: "Run Task",
        group: "Workspace",
        subtitle: !workspaceTrusted
          ? "Trust this workspace before running tasks"
          : folderPath
            ? "Run package, Go, or Cargo workspace tasks"
            : "Open a folder first",
        keywords: ["build", "test", "npm", "go", "cargo"],
        disabled: !folderPath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_TEST_EXPLORER,
        title: "Test Explorer",
        group: "Workspace",
        subtitle: !workspaceTrusted
          ? "Trust this workspace before running tests"
          : folderPath
            ? "Discover and run local project tests"
            : "Open a folder first",
        keywords: ["test", "vitest", "jest", "pytest", "go", "cargo"],
        disabled: !folderPath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_FILE_OUTLINE,
        title: "File Outline",
        group: "Navigation",
        shortcut: "Cmd Shift O",
        subtitle: activeFilePath
          ? `${activeFileSymbolCount} symbols in active file`
          : "Select a file first",
        keywords: ["symbols", "outline", "functions", "classes"],
        disabled: !activeFilePath,
      },
      {
        id: AXON_COMMANDS.OPEN_LANGUAGE_TOOLS,
        title: "Language Tools",
        group: "Language",
        subtitle: activeFilePath
          ? `LSP actions for ${language}`
          : "Select a file first",
        keywords: ["lsp", "code actions", "symbols", "rename", "format"],
        disabled: !activeFilePath,
      },
      {
        id: AXON_COMMANDS.GO_TO_DEFINITION,
        title: "Go to Definition",
        group: "Navigation",
        shortcut: "F12",
        subtitle: activeFilePath
          ? workspaceTrusted
            ? "Jump to the symbol definition Monaco can resolve"
            : "Trust this workspace before using language server navigation"
          : "Select a file first",
        keywords: ["definition", "symbol", "jump"],
        disabled: !activeFilePath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.FIND_REFERENCES,
        title: "Find References",
        group: "Navigation",
        shortcut: "Shift F12",
        subtitle: activeFilePath
          ? workspaceTrusted
            ? "Show usages for the current symbol"
            : "Trust this workspace before using language server navigation"
          : "Select a file first",
        keywords: ["references", "usages", "symbol"],
        disabled: !activeFilePath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.RENAME_SYMBOL,
        title: "Rename Symbol",
        group: "Navigation",
        subtitle: activeFilePath
          ? workspaceTrusted
            ? "Rename the current symbol through the active language server"
            : "Trust this workspace before using language server actions"
          : "Select a file first",
        keywords: ["rename", "symbol", "refactor"],
        disabled: !activeFilePath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.FORMAT_DOCUMENT,
        title: "Format Document",
        group: "Editor",
        subtitle: activeFilePath
          ? workspaceTrusted
            ? "Format the active file through the active language server"
            : "Trust this workspace before using language server actions"
          : "Select a file first",
        keywords: ["format", "pretty", "indent"],
        disabled: !activeFilePath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_HTML_PREVIEW,
        title: "Open HTML Preview",
        group: "Preview",
        subtitle:
          activeFilePath && isHtmlFile(activeFilePath)
            ? workspaceTrusted
              ? "Open the active HTML file in Axon's preview tab"
              : "Trust this workspace before running HTML preview"
            : "Select an HTML file first",
        keywords: ["browser", "live", "preview", "web"],
        disabled:
          !activeFilePath ||
          !isHtmlFile(activeFilePath) ||
          !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
        title: "Show Problems",
        group: "Panel",
        subtitle: `${diagnosticsCount} diagnostics`,
        keywords: ["diagnostics", "errors", "warnings"],
      },
      {
        id: AXON_COMMANDS.REFRESH_DIAGNOSTICS,
        title: "Refresh Diagnostics",
        group: "Diagnostics",
        subtitle: folderPath
          ? workspaceTrusted
            ? "Run project diagnostics for the current workspace"
            : "Trust this workspace before running diagnostics"
          : "Open a folder first",
        keywords: ["diagnostics", "check", "errors", "lint"],
        disabled: !folderPath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.NEXT_PROBLEM,
        title: "Go to Next Problem",
        group: "Diagnostics",
        shortcut: "F8",
        subtitle:
          diagnosticsCount > 0
            ? "Jump to the next diagnostic in the workspace"
            : "No problems in this workspace",
        keywords: ["diagnostics", "errors", "warnings", "next"],
        disabled: diagnosticsCount === 0,
      },
      {
        id: AXON_COMMANDS.PREVIOUS_PROBLEM,
        title: "Go to Previous Problem",
        group: "Diagnostics",
        shortcut: "Shift F8",
        subtitle:
          diagnosticsCount > 0
            ? "Jump to the previous diagnostic in the workspace"
            : "No problems in this workspace",
        keywords: ["diagnostics", "errors", "warnings", "previous"],
        disabled: diagnosticsCount === 0,
      },
      {
        id: AXON_COMMANDS.OPEN_OUTPUT_PANEL,
        title: "Show Output",
        group: "Panel",
        subtitle: "Open logs, task output, and future AI output",
        keywords: ["logs", "panel"],
      },
      {
        id: AXON_COMMANDS.CLEAR_OUTPUT,
        title: "Clear Output",
        group: "Panel",
        subtitle: "Clear the Output panel log",
        keywords: ["logs", "output", "reset"],
      },
      {
        id: AXON_COMMANDS.TOGGLE_TERMINAL,
        title: terminalOpen ? "Hide Terminal" : "Show Terminal",
        group: "Terminal",
        shortcut: "Cmd J",
        subtitle: workspaceTrusted
          ? "Toggle the terminal panel"
          : "Trust this workspace before opening a terminal",
        keywords: ["shell", "console"],
        disabled: !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.NEW_TERMINAL,
        title: "New Terminal",
        group: "Terminal",
        subtitle: workspaceTrusted
          ? "Create a terminal tab"
          : "Trust this workspace before creating a terminal",
        keywords: ["shell", "pty"],
        disabled: !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_DIFF_VIEW,
        title: "Compare Active File",
        group: "Git",
        shortcut: "Cmd Shift D",
        subtitle: activeFilePath
          ? "Open the active file diff view"
          : "Select a file first",
        keywords: ["diff", "changes"],
        disabled: !activeFilePath,
      },
      {
        id: AXON_COMMANDS.OPEN_SOURCE_CONTROL,
        title: "Source Control",
        group: "Git",
        shortcut: "Cmd Shift G",
        subtitle: folderPath
          ? `${gitChangeCount} changed file${gitChangeCount === 1 ? "" : "s"}`
          : "Open a folder first",
        keywords: ["git", "changes", "diff", "source"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_GIT_HISTORY,
        title: "Git History",
        group: "Git",
        subtitle: folderPath
          ? "Show commit history in the sidebar"
          : "Open a folder first",
        keywords: ["git", "history", "commit", "log"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.SAVE,
        title: "Save Active File",
        group: "File",
        shortcut: "Cmd S",
        subtitle: activeFilePath
          ? "Save the current tab"
          : "No active file",
        keywords: ["write"],
        disabled: !activeFilePath,
      },
      {
        id: AXON_COMMANDS.CLOSE_TAB,
        title: "Close Active Tab",
        group: "File",
        shortcut: "Cmd W",
        subtitle: activeFilePath
          ? "Close the current tab"
          : "No active file",
        keywords: ["remove"],
        disabled: !activeFilePath,
      },
      {
        id: AXON_COMMANDS.ASK_AXON,
        title: "Ask Axon",
        group: "AI",
        subtitle: settings.ai.enabled
          ? "Open project-aware local assistant"
          : "Enable Axon Agent in settings",
        keywords: ["ai", "agent", "chat", "local model"],
        disabled: !settings.ai.enabled,
      },
      {
        id: AXON_COMMANDS.AI_EXPLAIN_SELECTION,
        title: "AI: Explain Active File",
        group: "AI",
        subtitle: activeFilePath
          ? "Explain the active code with project context"
          : "Open a file first",
        keywords: ["ai", "explain", "selection", "code"],
        disabled: !settings.ai.enabled || !activeFilePath,
      },
      {
        id: AXON_COMMANDS.AI_FIX_PROBLEM,
        title: "AI: Fix Problem",
        group: "AI",
        subtitle:
          diagnosticsCount > 0
            ? `${diagnosticsCount} problem${diagnosticsCount === 1 ? "" : "s"} in context`
            : "No current problems",
        keywords: ["ai", "fix", "diagnostic", "problem"],
        disabled: !settings.ai.enabled || diagnosticsCount === 0,
      },
      {
        id: AXON_COMMANDS.AI_REFACTOR_SELECTION,
        title: "AI: Refactor Active File",
        group: "AI",
        subtitle: activeFilePath
          ? "Prepare a safer refactor proposal"
          : "Open a file first",
        keywords: ["ai", "refactor", "cleanup"],
        disabled: !settings.ai.enabled || !activeFilePath,
      },
      {
        id: AXON_COMMANDS.AI_GENERATE_TESTS,
        title: "AI: Generate Tests",
        group: "AI",
        subtitle: activeFilePath
          ? "Create test ideas or an edit proposal"
          : "Open a file first",
        keywords: ["ai", "test", "coverage"],
        disabled: !settings.ai.enabled || !activeFilePath,
      },
      {
        id: AXON_COMMANDS.AI_REVIEW_GIT_DIFF,
        title: "AI: Review Git Diff",
        group: "AI",
        subtitle:
          gitChangeCount > 0
            ? `${gitChangeCount} changed file${gitChangeCount === 1 ? "" : "s"}`
            : "No Git changes",
        keywords: ["ai", "review", "diff", "git"],
        disabled: !settings.ai.enabled || gitChangeCount === 0,
      },
      {
        id: AXON_COMMANDS.AI_DRAFT_COMMIT_MESSAGE,
        title: "AI: Draft Commit Message",
        group: "AI",
        subtitle:
          gitChangeCount > 0
            ? "Write a commit message for current changes"
            : "No Git changes",
        keywords: ["ai", "commit", "message", "git"],
        disabled: !settings.ai.enabled || gitChangeCount === 0,
      },
      {
        id: AXON_COMMANDS.OPEN_SETTINGS,
        title: "Open Settings",
        group: "Settings",
        shortcut: "Cmd ,",
        subtitle: "Edit settings from the UI",
        keywords: ["preferences", "theme", "font"],
      },
      {
        id: AXON_COMMANDS.OPEN_EXTENSIONS,
        title: "Open Extensions",
        group: "Extensions",
        subtitle: workspaceTrusted
          ? "Manage local extension packages and contributed themes"
          : "Trust this workspace before activating extensions",
        keywords: ["plugins", "themes", "syntax", "packages"],
        disabled: !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_SETTINGS_JSON,
        title: "Open Settings JSON",
        group: "Settings",
        shortcut: "Cmd Shift ,",
        subtitle: "Edit settings JSON directly",
        keywords: ["preferences", "config", "theme", "font"],
      },
      {
        id: AXON_COMMANDS.OPEN_UPDATE_NOTES,
        title: updateInfo?.updateAvailable
          ? `View Axon ${updateInfo.latestVersion} Update`
          : "View Update Notes",
        group: "Update",
        subtitle: updateInfo?.updateAvailable
          ? "Open release notes and update actions"
          : "No update is available",
        keywords: ["release", "version", "download"],
        disabled: !updateInfo?.updateAvailable,
      },
      {
        id: AXON_COMMANDS.TOGGLE_ZEN_MODE,
        title: zenMode ? "Exit Zen Mode" : "Enter Zen Mode",
        group: "View",
        shortcut: "Cmd Shift Z",
        subtitle: "Toggle focused editor layout",
        keywords: ["focus", "fullscreen"],
      },
      {
        id: AXON_COMMANDS.ABOUT,
        title: "About Axon",
        group: "Help",
        subtitle: "Show app and runtime information",
        keywords: ["version"],
      },
      ...extensionCommands,
    ];
}
