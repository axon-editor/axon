/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from "react";

const EMPTY_WORKSPACE_KEY = "__axon_empty_workspace__";

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
  // A workspace owns transient menus, editor widgets, terminals, and other
  // local component state. The key prevents any of that state from surviving
  // into the next workspace while application-level preferences stay mounted.
  // I no longer pulse the compositor here: the glass root tint keeps every
  // window pixel off alpha 0, so a workspace switch cannot expose a stale
  // vibrancy snapshot in the first place.
  return (
    <React.Fragment key={workspaceRenderKey(workspacePath)}>
      {children}
    </React.Fragment>
  );
}
