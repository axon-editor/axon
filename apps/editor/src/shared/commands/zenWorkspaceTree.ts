/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Cmd+B in zen must browse files without toggling the real sidebar back into
// the layout zen just removed. The overlay owns the modal, so the shortcut and
// the overlay share this event instead of threading modal state through the
// workbench props.
export const AXON_ZEN_WORKSPACE_TREE_EVENT = "axon:toggleZenWorkspaceTree";
