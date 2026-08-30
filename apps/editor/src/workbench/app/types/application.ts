import type { Dispatch, SetStateAction } from "react";

import type { AiActionId } from "../../../shared/ai";
import type { OutputEntryLevel } from "../../../platform/panel/bottomPanel";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type AppendOutput = (
  source: string,
  message: string,
  level?: OutputEntryLevel,
) => void;

export type RequireTrustedWorkspace = (feature: string) => boolean;

export type RefreshGitStatus = (options?: {
  silent?: boolean;
}) => Promise<void>;

export type EditorActionRequest =
  | "definition"
  | "references"
  | "rename"
  | "format"
  | "snapshot"
  | "inspect-token";

export type AgentActionRequest = {
  action: AiActionId;
  nonce: number;
};

export type SidebarView = "files" | "history" | "spotify";
