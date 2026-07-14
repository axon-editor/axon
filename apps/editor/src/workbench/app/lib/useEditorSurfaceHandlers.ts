import { useEffect } from "react";
import { openFileInPane, splitPane } from "../../../renderer/features/editor/lib/layoutManager";
import type { SplitDirection } from "../../../renderer/features/editor/lib/types";
import { createHtmlPreviewTabPath } from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import type { WorkspaceSearchResult } from "../../../renderer/shared/lib/api";
import { AXON_OPEN_CODE_SNAPSHOT_EVENT } from "@axon-builtin-code-snapshot/lib/codeSnapshotTabs";

interface EditorSurfaceHandlersOptions {
  appendOutput: any;
  folderPath: string | null;
  handleOpenNavigationTarget: any;
  requireTrustedWorkspace: any;
  setBottomPanelOpen: any;
  setLayout: any;
  setTerminalCreateNonce: any;
  setTerminalCreateWorkingDirectory: any;
  setTerminalOpen: any;
}

export function useEditorSurfaceHandlers({
  appendOutput,
  folderPath,
  handleOpenNavigationTarget,
  requireTrustedWorkspace,
  setBottomPanelOpen,
  setLayout,
  setTerminalCreateNonce,
  setTerminalCreateWorkingDirectory,
  setTerminalOpen,
}: EditorSurfaceHandlersOptions) {
  useEffect(() => {
    const openSnapshotTab = (event: Event) => {
      const snapshotEvent = event as CustomEvent<{ tabPath?: string }>;
      const tabPath = snapshotEvent.detail?.tabPath;
      if (!tabPath) return;

      // Snapshot design needs the full editor height. Closing bottom surfaces
      // here prevents the new tab from inheriting a cramped terminal layout.
      setTerminalOpen(false);
      setBottomPanelOpen(false);
      setLayout((current: any) =>
        openFileInPane(current, current.activePaneId, tabPath),
      );
    };

    window.addEventListener(AXON_OPEN_CODE_SNAPSHOT_EVENT, openSnapshotTab);
    return () =>
      window.removeEventListener(AXON_OPEN_CODE_SNAPSHOT_EVENT, openSnapshotTab);
  }, [setBottomPanelOpen, setLayout, setTerminalOpen]);

  const handleOpenHtmlPreview = (filePath: string) => {
    if (!requireTrustedWorkspace("HTML preview")) return;

    // Preview is an editor surface and should receive the full available height.
    // Browser console messages are routed into Axon's Output tab, so neither the
    // terminal nor the bottom panel needs to remain open beside the preview.
    setTerminalOpen(false);
    setBottomPanelOpen(false);

    // HTML previews are represented as their own tab identity because a source
    // document and its rendered browser view are different editor surfaces.
    // Reusing the raw file path would make the preview fight with the Monaco
    // editor tab, while this wrapped path lets normal tab actions still move,
    // close, and persist the preview like every other pane tab.
    setLayout((prev: any) =>
      openFileInPane(
        prev,
        prev.activePaneId,
        createHtmlPreviewTabPath(filePath),
      ),
    );
  };

  const handleWorkspaceSearchResult = (
    result: WorkspaceSearchResult,
    query: string,
  ) => {
    handleOpenNavigationTarget({
      path: result.path,
      line: result.line,
      column: result.column,
      length: Math.max(1, query.trim().length),
    });
  };

  const handleSplit = (direction: SplitDirection, filePath?: string) => {
    setLayout((prev: any) =>
      splitPane(prev, prev.activePaneId, direction, filePath),
    );
  };

  const handleNewTerminal = () => {
    if (!requireTrustedWorkspace("Terminal")) return;

    setTerminalCreateWorkingDirectory(null);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce: number) => nonce + 1);
    appendOutput("terminal", "Created terminal tab.");
  };

  const handleOpenTabInTerminal = (filePath: string) => {
    if (!requireTrustedWorkspace("Terminal")) return;

    const separatorIndex = Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\"),
    );
    const parentPath =
      separatorIndex > 0 ? filePath.slice(0, separatorIndex) : folderPath;

    setTerminalCreateWorkingDirectory(parentPath);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce: number) => nonce + 1);
    appendOutput(
      "terminal",
      `Opening terminal at ${parentPath ?? "workspace"}.`,
    );
  };

  const handleOpenPathInTerminal = (path: string) => {
    if (!requireTrustedWorkspace("Terminal")) return;

    setTerminalCreateWorkingDirectory(path);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce: number) => nonce + 1);
    appendOutput("terminal", `Opening terminal at ${path}.`);
  };

  return {
    handleNewTerminal,
    handleOpenHtmlPreview,
    handleOpenPathInTerminal,
    handleOpenTabInTerminal,
    handleSplit,
    handleWorkspaceSearchResult,
  };
}
