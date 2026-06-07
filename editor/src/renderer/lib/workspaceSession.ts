import { type FileNode } from "./api";
import { createInitialLayout } from "./layoutManager";
import { type Layout } from "./types";
import { type BottomPanelTab } from "../components/BottomPanel";

const SESSION_KEY = "axon:workspaceSession";

export interface WorkspaceSession {
  folderPath: string | null;
  layout: Layout;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  terminalOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectFilePaths(node: FileNode, paths = new Set<string>()) {
  if (!node.is_dir) paths.add(node.path);
  for (const child of node.children ?? []) {
    collectFilePaths(child, paths);
  }
  return paths;
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SESSION_KEY) ?? "null",
    ) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.folderPath !== null && typeof parsed.folderPath !== "string") {
      return null;
    }

    return {
      folderPath: parsed.folderPath,
      layout: isRecord(parsed.layout)
        ? (parsed.layout as unknown as Layout)
        : createInitialLayout(),
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      sidebarWidth:
        typeof parsed.sidebarWidth === "number"
          ? Math.min(360, Math.max(176, parsed.sidebarWidth))
          : 208,
      terminalOpen: parsed.terminalOpen === true,
      bottomPanelOpen: parsed.bottomPanelOpen === true,
      bottomPanelTab:
        parsed.bottomPanelTab === "output" ? "output" : "problems",
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceSession(session: WorkspaceSession) {
  if (!session.folderPath) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function sanitizeRestoredLayout(
  layout: Layout | null | undefined,
  tree: FileNode,
): Layout {
  const fallback = createInitialLayout();
  if (!layout || !Array.isArray(layout.panes) || layout.panes.length === 0) {
    return fallback;
  }

  const filePaths = collectFilePaths(tree);
  const panes = layout.panes.slice(0, 5).map((pane) => {
    const openTabs = Array.isArray(pane.openTabs)
      ? pane.openTabs.filter((tab) => filePaths.has(tab))
      : [];
    const activeFile =
      pane.activeFile && openTabs.includes(pane.activeFile)
        ? pane.activeFile
        : (openTabs.at(-1) ?? null);

    return {
      id: typeof pane.id === "string" ? pane.id : fallback.panes[0].id,
      openTabs,
      activeFile,
      dirtyFiles: {},
    };
  });

  const activePaneId = panes.some((pane) => pane.id === layout.activePaneId)
    ? layout.activePaneId
    : panes[0].id;

  return {
    panes,
    activePaneId,
    splitDirection:
      layout.splitDirection === "vertical" ? "vertical" : "horizontal",
  };
}
