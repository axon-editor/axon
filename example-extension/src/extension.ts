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
