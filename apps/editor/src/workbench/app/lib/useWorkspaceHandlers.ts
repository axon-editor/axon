import { addRecentFolder, getWorkspaceTrustState } from "../../../renderer/features/sidebar";
import { createInitialLayout, openFileInPane } from "../../../renderer/features/editor/lib/layoutManager";
import { getTree, createFile, type FileNode } from "../../../renderer/shared/lib/api";
import { sanitizeRestoredLayout, type WorkspaceSession } from "../../../renderer/shared/lib/workspaceSession";
import { createWorkspaceRoot, upsertWorkspaceRoot } from "../../../renderer/shared/lib/workspaceRoots";
import { normalizeSettings } from "../../../shared/settings";

interface WorkspaceHandlersOptions {
  allowSessionPersistenceRef: any;
  appendOutput: any;
  bottomPanelOpen: any;
  bottomPanelTab: any;
  folderPath: any;
  refreshGitStatus: any;
  setActiveRootId: any;
  setBottomPanelOpen: any;
  setBottomPanelTab: any;
  setFolderPath: any;
  setGitStatus: any;
  setLayout: any;
  setLoading: any;
  setSettings: any;
  setSidebarCollapsed: any;
  setSidebarWidth: any;
  setTerminalCreateWorkingDirectory: any;
  setTerminalOpen: any;
  setTree: any;
  setWorkspaceRoots: any;
  setWorkspaceTrustPromptPath: any;
  sidebarCollapsed: any;
  sidebarWidth: any;
  terminalOpen: any;
  workspaceRoots: any;
}

export function useWorkspaceHandlers({
  allowSessionPersistenceRef,
  appendOutput,
  bottomPanelOpen,
  bottomPanelTab,
  folderPath,
  refreshGitStatus,
  setActiveRootId,
  setBottomPanelOpen,
  setBottomPanelTab,
  setFolderPath,
  setGitStatus,
  setLayout,
  setLoading,
  setSettings,
  setSidebarCollapsed,
  setSidebarWidth,
  setTerminalCreateWorkingDirectory,
  setTerminalOpen,
  setTree,
  setWorkspaceRoots,
  setWorkspaceTrustPromptPath,
  sidebarCollapsed,
  sidebarWidth,
  terminalOpen,
  workspaceRoots,
}: WorkspaceHandlersOptions) {
  const handleOpenFolder = async () => {
    try {
      const path = await window.axon.openFolder();
      if (!path) return;
      setLoading(true);
      appendOutput("workspace", `Opening ${path}`);
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await handleFolderChange(path, fileTree);
      appendOutput("workspace", `Opened ${path}`, "success");
    } catch (err) {
      console.error("failed to load tree:", err);
      const message =
        err instanceof Error
          ? `Failed to open folder: ${err.message}`
          : "Failed to open folder.";
      appendOutput("workspace", message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchWorkspaceRoot = async (path: string) => {
    if (path === folderPath) return;

    try {
      setLoading(true);
      appendOutput("workspace", `Switching to ${path}`);
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await handleFolderChange(path, fileTree, {
        folderPath: path,
        roots: workspaceRoots,
        activeRootId:
          workspaceRoots.find((root: any) => root.path === path)?.id ?? path,
        layout: createInitialLayout(),
        sidebarCollapsed,
        sidebarWidth,
        terminalOpen,
        bottomPanelOpen,
        bottomPanelTab,
      });
      appendOutput("workspace", `Switched to ${path}`, "success");
    } catch (err) {
      console.error("failed to switch workspace root:", err);
      appendOutput("workspace", "Failed to switch workspace root.", "error");
    } finally {
      setLoading(false);
    }
  };



  const handleFolderChange = async (
    path: string,
    fileTree: FileNode,
    restoredSession?: WorkspaceSession | null,
  ) => {
    allowSessionPersistenceRef.current = true;
    const restoredRoots =
      restoredSession?.roots && restoredSession.roots.length > 0
        ? restoredSession.roots
        : [];
    const nextRoots =
      restoredRoots.length > 0
        ? upsertWorkspaceRoot(restoredRoots, path, getWorkspaceTrustState(path))
        : upsertWorkspaceRoot(
            workspaceRoots,
            path,
            getWorkspaceTrustState(path),
          );
    const nextActiveRoot =
      nextRoots.find((root: any) => root.path === path) ?? createWorkspaceRoot(path);

    setWorkspaceRoots(nextRoots);
    setActiveRootId(nextActiveRoot.id);
    setFolderPath(path);
    setTree(fileTree);
    setLayout(
      restoredSession?.layout
        ? sanitizeRestoredLayout(restoredSession.layout, fileTree)
        : createInitialLayout(),
    );

    // Opening another project should reset project-scoped UI. When this call is
    // fed by session restore, we apply the persisted chrome state; when it is a
    // fresh folder switch, the absent session naturally resets panels and panes.
    setTerminalOpen(restoredSession?.terminalOpen === true);
    setSidebarCollapsed(restoredSession?.sidebarCollapsed === true);
    setSidebarWidth(restoredSession?.sidebarWidth ?? 208);
    setBottomPanelOpen(restoredSession?.bottomPanelOpen === true);
    setBottomPanelTab(restoredSession?.bottomPanelTab ?? "problems");
    setTerminalCreateWorkingDirectory(null);
    appendOutput("workspace", `Loaded file tree for ${path}`);
    if (getWorkspaceTrustState(path) === null) {
      setWorkspaceTrustPromptPath(path);
    }

    try {
      const workspaceSettings = await window.axon.getSettings(path);
      setSettings(normalizeSettings(workspaceSettings));
    } catch (err) {
      console.error("failed to load workspace settings:", err);
      appendOutput("settings", "Failed to load workspace settings.", "error");
    }

    await window.axon.unwatchFolder();
    await window.axon.watchFolder(path);
    appendOutput("workspace", "Watching workspace changes.");
    void window.axon
      .getGitStatus(path)
      .then(setGitStatus)
      .catch(() => {
        setGitStatus(null);
      });
  };

  const handleRefresh = async () => {
    if (!folderPath) return;
    try {
      const fileTree = await getTree(folderPath);
      setTree(fileTree);
      await refreshGitStatus({ silent: true });
      appendOutput("workspace", "Refreshed file tree.");
    } catch (err) {
      console.error("failed to refresh tree:", err);
      appendOutput("workspace", "Failed to refresh file tree.", "error");
    }
  };

  const handleNewFile = async () => {
    if (!folderPath) return;
    try {
      const name = `untitled-${Date.now()}.ts`;
      const path = `${folderPath}/${name}`;
      await createFile(path);
      await handleRefresh();
      setLayout((prev: any) => openFileInPane(prev, prev.activePaneId, path));
      appendOutput("file", `Created ${name}`, "success");
    } catch (err) {
      console.error("failed to create file:", err);
      appendOutput("workspace", "Failed to create file.", "error");
    }
  };

  // open a file in the active pane
  const handleFileSelect = (filePath: string) => {
    setLayout((prev: any) => openFileInPane(prev, prev.activePaneId, filePath));
  };

  return {
    handleFileSelect,
    handleFolderChange,
    handleNewFile,
    handleOpenFolder,
    handleRefresh,
    handleSwitchWorkspaceRoot,
  };
}
