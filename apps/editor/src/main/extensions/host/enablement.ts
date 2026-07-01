import fs from "fs";
import path from "path";
import { getExtensionStatePath } from "../paths";
import { readJsonFile } from "./json";

interface ExtensionEnablementState {
  disabled: string[];
}

export function readDisabledExtensionIds() {
  const state = readJsonFile<ExtensionEnablementState>(getExtensionStatePath());
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
