/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AxonExtensionApi,
  type ExtensionContext,
} from "../../packages/extension-api/src";

export function activate(context: ExtensionContext, api: AxonExtensionApi) {
  const command = api.commands.registerCommand("axon.example.sayHello", () => {
    return "Hello from the Axon example extension.";
  });

  context.subscriptions.push(command);
}
