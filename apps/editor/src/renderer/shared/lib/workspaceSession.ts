import { type FileNode } from "./api";
import { createInitialLayout } from "../../features/editor/lib/layoutManager";
import { type Layout } from "../../features/editor/lib/types";
import {
  getTabFilePath,
  isVirtualTabPath,
} from "../../features/editor/lib/tabIdentity";
import { isWelcomeTabPath } from "../../features/onboarding/lib/welcomeTab";
import { isCodeSnapshotTabPath } from "@axon-builtin-code-snapshot/lib/codeSnapshotTabs";
import { type BottomPanelTab } from "../../../platform/panel/bottomPanel";
import {
  createWorkspaceRoot,
  normalizeWorkspaceRoots,
  type WorkspaceRoot,
} from "./workspaceRoots";

const SESSION_KEY = "axon:workspaceSession";

export interface WorkspaceSession {
  folderPath: string | null;
  roots: WorkspaceRoot[];
  activeRootId: string | null;
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

    const folderPath = parsed.folderPath;
    const roots = normalizeWorkspaceRoots(parsed.roots);
    const normalizedRoots =
      roots.length > 0
        ? roots
        : typeof folderPath === "string"
          ? [createWorkspaceRoot(folderPath)]
          : [];
    const activeRootId =
      typeof parsed.activeRootId === "string" &&
      normalizedRoots.some((root) => root.id === parsed.activeRootId)
        ? parsed.activeRootId
        : (normalizedRoots[0]?.id ?? null);

    return {
      folderPath,
      roots: normalizedRoots,
      activeRootId,
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
      bottomPanelTab: "output",
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceSession(session: WorkspaceSession) {
  if (!session.folderPath && session.roots.length === 0) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearWorkspaceSession() {
  localStorage.removeItem(SESSION_KEY);
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
  const isRestorableTab = (tab: string) => {
    // Welcome/onboarding is app-aware, not workspace-aware. Old sessions may
    // contain the virtual welcome tab from the period where it was used as the
    // generic initial layout; restoring that tab would make every folder switch
    // feel like first launch again, so workspace restore intentionally drops it.
    if (isWelcomeTabPath(tab)) return false;
    if (isCodeSnapshotTabPath(tab)) return false;
    if (isVirtualTabPath(tab)) return filePaths.has(getTabFilePath(tab));
    return filePaths.has(tab);
  };
  const panes = layout.panes.slice(0, 5).map((pane) => {
    const openTabs = Array.isArray(pane.openTabs)
      ? pane.openTabs.filter(isRestorableTab)
      : [];
    const activeFile =
      pane.activeFile && openTabs.includes(pane.activeFile)
        ? pane.activeFile
        : (openTabs.at(-1) ?? null);

    const pinnedTabs = Array.isArray(pane.pinnedTabs)
      ? pane.pinnedTabs.filter((tab) => openTabs.includes(tab))
      : [];

    return {
      id: typeof pane.id === "string" ? pane.id : fallback.panes[0].id,
      openTabs,
      activeFile,
      dirtyFiles: {},
      // Older saved sessions were written before pinned tabs existed. I
      // normalize the shape here instead of forcing users to clear storage,
      // because restore should be boring even after Axon's layout model grows.
      pinnedTabs,
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
