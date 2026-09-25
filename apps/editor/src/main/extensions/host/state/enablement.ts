/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import { getExtensionStatePath } from "../../paths";
import { readJsonFile } from "../shared/json";

interface ExtensionEnablementState {
  disabled: string[];
}

export async function readDisabledExtensionIds() {
  // Enablement state is consulted on every extension state refresh, which runs
  // during startup and whenever a workspace opens. Reading it asynchronously
  // keeps that refresh off the main-process event loop.
  const state = await readJsonFile<ExtensionEnablementState>(
    getExtensionStatePath(),
  );
  return Array.isArray(state?.disabled)
    ? state.disabled.filter((id): id is string => typeof id === "string")
    : [];
}

export function writeDisabledExtensionIds(disabledIds: string[]) {
  fs.mkdirSync(path.dirname(getExtensionStatePath()), { recursive: true });
  fs.writeFileSync(
    getExtensionStatePath(),
    JSON.stringify({ disabled: [...disabledIds].sort() }, null, 2),
  );
}
