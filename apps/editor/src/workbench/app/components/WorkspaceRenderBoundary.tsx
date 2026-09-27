/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from "react";

const EMPTY_WORKSPACE_KEY = "__axon_empty_workspace__";
export const WORKSPACE_REPAINT_CLASS = "axon-workspace-repaint";

function workspaceRenderKey(workspacePath: string | null) {
  return workspacePath ?? EMPTY_WORKSPACE_KEY;
}

// macOS can retain transparent Chromium pixels above its native vibrancy
// view. A later hover then damages only a small rectangle and exposes that
// stale frame. Moving the root through a temporary compositor layer makes
// Chromium submit the complete surface once. The opacity is below an 8-bit
// alpha step, so this does not tint or cover native Glass.
//
// Two rAFs rather than one, because the class has to survive until a frame
// has actually been committed with it applied. Removing it in the same frame
// it lands never reaches the compositor, which is the whole point.
//
// Callers must run the returned cancel function on cleanup. Otherwise a
// pending frame pair can strip the class out from under a newer pulse and
// leave the repaint half applied.
export function triggerCompositorRepaint() {
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

    return triggerCompositorRepaint();
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
