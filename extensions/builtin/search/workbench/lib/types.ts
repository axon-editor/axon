/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AxonCommand } from "@axon-editor/shared/commands";

export interface CommandPaletteCommand {
  id: AxonCommand;
  title: string;
  group?: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
}
