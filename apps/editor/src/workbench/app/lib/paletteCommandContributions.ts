import { getBuiltinCommandAlias } from "../../contrib/extensions/lib/builtinWorkbenchContributions";

export function shouldIncludeContributedCommand(commandId: string) {
  // I exclude built-in aliases because their native workbench commands already
  // provide context-aware palette items. The manifests still contribute stable
  // IDs for activation and external callers, but rendering those IDs here would
  // create two rows that ultimately dispatch to the same command.
  return !getBuiltinCommandAlias(commandId);
}
