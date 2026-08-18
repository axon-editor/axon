import * as React from "react";

const EMPTY_WORKSPACE_KEY = "__axon_empty_workspace__";
export const WORKSPACE_REPAINT_CLASS = "axon-workspace-repaint";

function workspaceRenderKey(workspacePath: string | null) {
  return workspacePath ?? EMPTY_WORKSPACE_KEY;
}

export function WorkspaceRenderBoundary({
  children,
  workspacePath,
}: {
  children: React.ReactNode;
  workspacePath: string | null;
}) {
  const previousWorkspacePath = React.useRef(workspacePath);

  React.useLayoutEffect(() => {
    if (previousWorkspacePath.current === workspacePath) return;
    previousWorkspacePath.current = workspacePath;

    // macOS can retain transparent Chromium pixels above its native vibrancy
    // view. A later hover then damages only a small rectangle and exposes that
    // stale frame. Moving the new workbench through a temporary compositor
    // layer makes Chromium submit the complete surface once. The opacity is
    // below an 8-bit alpha step, so this does not tint or cover native Glass.
    const documentElement = document.documentElement;
    documentElement.classList.add(WORKSPACE_REPAINT_CLASS);
    let finishFrame = 0;
    const startFrame = window.requestAnimationFrame(() => {
      finishFrame = window.requestAnimationFrame(() => {
        documentElement.classList.remove(WORKSPACE_REPAINT_CLASS);
      });
    });

    return () => {
      window.cancelAnimationFrame(startFrame);
      window.cancelAnimationFrame(finishFrame);
      documentElement.classList.remove(WORKSPACE_REPAINT_CLASS);
    };
  }, [workspacePath]);

  // A workspace owns transient menus, editor widgets, terminals, and other
  // local component state. The key prevents any of that state from surviving
  // into the next workspace while application-level preferences stay mounted.
  return (
    <React.Fragment key={workspaceRenderKey(workspacePath)}>
      {children}
    </React.Fragment>
  );
}
