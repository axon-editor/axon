/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AXON_EDITOR_SAVE_EVENT = "axon:saveFile";

export interface EditorSaveEventDetail {
  path: string;
}

export function dispatchEditorSave(path: string) {
  const event = new CustomEvent<EditorSaveEventDetail>(AXON_EDITOR_SAVE_EVENT, {
    cancelable: true,
    detail: { path },
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
