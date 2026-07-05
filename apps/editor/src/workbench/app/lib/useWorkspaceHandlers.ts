import { useRef } from "react";
import { addRecentFolder, getWorkspaceTrustState } from "../../../renderer/features/sidebar";
import { createInitialLayout, openFileInPane } from "../../../renderer/features/editor/lib/layoutManager";
import { getTree, createFile, type FileNode } from "../../../renderer/shared/lib/api";
import {
  markAxonPerformance,
  measureAxonPerformance,
} from "../../../renderer/shared/lib/performanceMarks";
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
  const workspaceServiceRequestRef = useRef(0);

  const handleOpenFolder = async () => {
    try {
      const path = await window.axon.openFolder();
      if (!path) return;
      markAxonPerformance("axon.workspace.open.start", { source: "picker" });
      setLoading(true);
      appendOutput("workspace", `Opening ${path}`);
      markAxonPerformance("axon.workspace.tree.start", { source: "picker" });
      const fileTree = await getTree(path);
      markAxonPerformance("axon.workspace.tree.end", { source: "picker" });
      measureAxonPerformance(
        "axon.workspace.tree",
        "axon.workspace.tree.start",
        "axon.workspace.tree.end",
      );
      addRecentFolder(path);
      await handleFolderChange(path, fileTree);
      markAxonPerformance("axon.workspace.open.end", { source: "picker" });
      measureAxonPerformance(
        "axon.workspace.open",
        "axon.workspace.open.start",
        "axon.workspace.open.end",
      );
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
      markAxonPerformance("axon.workspace.switch.start", { source: "root" });
      markAxonPerformance("axon.workspace.tree.start", { source: "root" });
      const fileTree = await getTree(path);
      markAxonPerformance("axon.workspace.tree.end", { source: "root" });
      measureAxonPerformance(
        "axon.workspace.tree",
        "axon.workspace.tree.start",
        "axon.workspace.tree.end",
      );
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
      markAxonPerformance("axon.workspace.switch.end", { source: "root" });
      measureAxonPerformance(
        "axon.workspace.switch",
        "axon.workspace.switch.start",
        "axon.workspace.switch.end",
      );
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
    markAxonPerformance("axon.workspace.apply.start", {
      restored: restoredSession ? true : false,
    });
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
    setBottomPanelTab("output");
    setTerminalCreateWorkingDirectory(null);
    appendOutput("workspace", `Loaded file tree for ${path}`);
    if (getWorkspaceTrustState(path) === null) {
      setWorkspaceTrustPromptPath(path);
    }

    markAxonPerformance("axon.workspace.apply.end", {
      restored: restoredSession ? true : false,
    });
    measureAxonPerformance(
      "axon.workspace.apply",
      "axon.workspace.apply.start",
      "axon.workspace.apply.end",
    );

    const serviceRequest = ++workspaceServiceRequestRef.current;
    markAxonPerformance("axon.workspace.services.start", {
      restored: restoredSession ? true : false,
    });

    // The project should become visible as soon as the file tree is available.
    // Settings hydration, watcher startup, and Git status are useful, but they
    // are not prerequisites for showing the workspace. Running them in the
    // background keeps folder selection feeling local and immediate while the
    // stale request guard prevents a slow previous workspace from repainting
    // state after the user has already opened another folder.
    void Promise.allSettled([
      window.axon
        .getSettings(path)
        .then((workspaceSettings) => {
          if (workspaceServiceRequestRef.current !== serviceRequest) return;
          setSettings(normalizeSettings(workspaceSettings));
        })
        .catch((err) => {
          if (workspaceServiceRequestRef.current !== serviceRequest) return;
          console.error("failed to load workspace settings:", err);
          appendOutput("settings", "Failed to load workspace settings.", "error");
        }),
      window.axon
        .watchFolder(path)
        .then(() => {
          if (workspaceServiceRequestRef.current !== serviceRequest) return;
          appendOutput("workspace", "Watching workspace changes.");
        })
        .catch((err) => {
          if (workspaceServiceRequestRef.current !== serviceRequest) return;
          console.error("failed to watch workspace:", err);
          appendOutput("workspace", "Failed to watch workspace changes.", "error");
        }),
      window.axon
        .getGitStatus(path)
        .then((status) => {
          if (workspaceServiceRequestRef.current !== serviceRequest) return;
          setGitStatus(status);
        })
        .catch(() => {
          if (workspaceServiceRequestRef.current !== serviceRequest) return;
          setGitStatus(null);
        }),
    ]).finally(() => {
      if (workspaceServiceRequestRef.current !== serviceRequest) return;
      markAxonPerformance("axon.workspace.services.end", {
        restored: restoredSession ? true : false,
      });
      measureAxonPerformance(
        "axon.workspace.services",
        "axon.workspace.services.start",
        "axon.workspace.services.end",
      );
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
