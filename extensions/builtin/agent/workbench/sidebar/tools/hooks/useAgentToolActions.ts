/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { type AiEditFileProposal } from "@axon-editor/shared/ai/ai";
import {
  type AgentMessage,
  type AgentToolCallState,
} from "../../../lib/conversation";
import { type AgentToolRunResult } from "../../../lib/actions/agentToolActions";
import { updateAgentTool } from "../../../lib/conversation/timeline";
import { resolveProposalPath } from "../../../lib/conversation/agentProposalPaths";
import { resolveAgentMessageLink } from "../../../lib/links/agentMessageLinks";

interface Params {
  folderPath: string | null;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  setCopiedId: Dispatch<SetStateAction<number | null>>;
  onApplyEdit: (path: string, content: string) => Promise<void>;
  onOpenFile: (path: string) => void;
  onRunAgentAction: (
    name: string,
    args: Record<string, unknown>,
  ) => AgentToolRunResult | Promise<AgentToolRunResult>;
}

export interface AgentToolActions {
  allowTool: (messageId: number, tool: AgentToolCallState) => void;
  applyEdit: (file: AiEditFileProposal) => void;
  handleCopied: (messageId: number) => void;
  openMessageLink: (href: string) => void;
  runTool: (
    messageId: number,
    tool: AgentToolCallState,
    allowForSession?: boolean,
  ) => void;
  skipTool: (messageId: number, tool: AgentToolCallState) => void;
}

// Tool approval, edit application, link opening, and copy feedback all mutate
// the same transcript. One hook keeps those mutations together and gives the
// sidebar stable handlers for the memoized message list.
export function useAgentToolActions({
  folderPath,
  setMessages,
  setCopiedId,
  onApplyEdit,
  onOpenFile,
  onRunAgentAction,
}: Params): AgentToolActions {
  const applyEdit = useCallback(
    (file: AiEditFileProposal) => {
      const resolvedPath = folderPath
        ? resolveProposalPath(file.path, folderPath)
        : file.path;
      if (!resolvedPath) {
        setMessages((current) => [
          ...current,
          {
            id: Date.now(),
            role: "assistant",
            content: `Skipped unsafe edit proposal path outside the workspace: ${file.path}`,
          },
        ]);
        return;
      }
      void Promise.resolve(onApplyEdit(resolvedPath, file.newContent)).then(
        () => {
          setMessages((current) => [
            ...current,
            {
              id: Date.now(),
              role: "assistant",
              content: `Applied ${resolvedPath}`,
            },
          ]);
        },
      );
    },
    [folderPath, onApplyEdit, setMessages],
  );

  const openMessageLink = useCallback(
    (href: string) => {
      const target = resolveAgentMessageLink(href, folderPath);
      if (!target) return;
      if (target.kind === "external") {
        void window.axon?.openExternalLink(target.href);
        return;
      }
      if (target.kind === "file") {
        onOpenFile(target.path);
      }
    },
    [folderPath, onOpenFile],
  );

  const setToolStatus = useCallback(
    (
      messageId: number,
      toolId: string,
      status: AgentToolCallState["status"],
      message?: string,
    ) => {
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? updateAgentTool(item, toolId, {
                status,
                ...(message !== undefined ? { message } : {}),
              })
            : item,
        ),
      );
    },
    [setMessages],
  );

  const runTool = useCallback(
    (
      messageId: number,
      tool: AgentToolCallState,
      allowForSession = false,
    ) => {
      setToolStatus(messageId, tool.id, "running");
      // OpenCode executed the tool itself and is waiting for a permission
      // decision. Running it again through Axon's local action bridge would
      // duplicate the command or write.
      if (tool.permissionOnly) {
        void window.axon.reportAiUiToolResult({
          callId: tool.id,
          ok: true,
          ...(allowForSession ? { allowForSession: true } : {}),
        });
        return;
      }
      void Promise.resolve(onRunAgentAction(tool.name, tool.arguments)).then(
        (result) =>
          window.axon.reportAiUiToolResult({
            callId: tool.id,
            ok: result.ok,
            message: result.message,
            ...(allowForSession ? { allowForSession: true } : {}),
          }),
      );
    },
    [onRunAgentAction, setToolStatus],
  );

  const allowTool = useCallback(
    (messageId: number, tool: AgentToolCallState) => {
      runTool(messageId, tool, true);
    },
    [runTool],
  );

  const skipTool = useCallback(
    (messageId: number, tool: AgentToolCallState) => {
      setToolStatus(messageId, tool.id, "rejected");
      void window.axon.reportAiUiToolResult({
        callId: tool.id,
        ok: false,
        rejected: true,
        message: "Skipped by user.",
      });
    },
    [setToolStatus],
  );

  const handleCopied = useCallback(
    (messageId: number) => {
      setCopiedId(messageId);
      window.setTimeout(() => setCopiedId(null), 1200);
    },
    [setCopiedId],
  );

  return {
    allowTool,
    applyEdit,
    handleCopied,
    openMessageLink,
    runTool,
    skipTool,
  };
}
