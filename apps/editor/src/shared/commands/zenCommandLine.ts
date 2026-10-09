/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 * --------------------------------------------------------------------------------------------*/

// Event bus for the vim-style zen command readout. Chrome shortcuts fire this
// while they run so the readout can flash the label of whatever used to live on
// the now-hidden status bar; the readout component only mounts in zen, so the
// event is inert everywhere else.
export const AXON_ZEN_COMMAND_EVENT = "axon:zen-command";

export function announceZenCommand(label: string) {
  window.dispatchEvent(
    new CustomEvent<string>(AXON_ZEN_COMMAND_EVENT, { detail: label }),
  );
}
