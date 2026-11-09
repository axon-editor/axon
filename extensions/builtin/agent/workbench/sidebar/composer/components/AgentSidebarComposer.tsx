/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import { Send, StopCircle } from "lucide-react";
import { type AiActionId } from "@axon-editor/shared/ai/ai";
import { type EditorDiagnostic } from "@axon-editor/shared/editor/language/diagnostics";
import { type GitChange } from "@axon-editor/shared/workspace/git";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import SlashCommandMenu from "../../../chat/composer/SlashCommandMenu";
import { type AgentModelRuntimeState } from "../../../lib/hooks/useAgentModelRuntime";
import AgentModelPicker from "../../models/components/AgentModelPicker";
import AgentComposerActionPicker from "./AgentComposerActionPicker";
import AgentComposerContextChips from "./AgentComposerContextChips";
import {
  type ContextEnabled,
  DEFAULT_CONTEXT_ENABLED,
} from "../model/contextEnabled";

interface Props {
  action: AiActionId;
  activeFilePath: string | null;
  activeStreamId: string | null;
  busy: boolean;
  canChat: boolean;
  conversationReady: boolean;
  diagnostics: EditorDiagnostic[];
  folderPath: string | null;
  gitChanges: GitChange[];
  modelRuntime: AgentModelRuntimeState;
  prompt: string;
  resetNonce: number;
  onCancelStream: () => void;
  onPromptChange: (prompt: string) => void;
  onRunAgent: () => void;
  onSelectAction: (action: AiActionId) => void;
}

export default function AgentSidebarComposer({
  action,
  activeFilePath,
  activeStreamId,
  busy,
  canChat,
  conversationReady,
  diagnostics,
  folderPath,
  gitChanges,
  modelRuntime,
  prompt,
  resetNonce,
  onCancelStream,
  onPromptChange,
  onRunAgent,
  onSelectAction,
}: Props) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [contextEnabled, setContextEnabled] = useState<ContextEnabled>(
    DEFAULT_CONTEXT_ENABLED,
  );
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [prompt]);

  useEffect(() => {
    setContextEnabled(DEFAULT_CONTEXT_ENABLED);
  }, [resetNonce]);

  const insertNewline = (textarea: HTMLTextAreaElement) => {
    textarea.setRangeText(
      "\n",
      textarea.selectionStart,
      textarea.selectionEnd,
      "end",
    );
    onPromptChange(textarea.value);
    setSlashCommandOpen(false);
  };

  const handlePromptChange = (value: string) => {
    onPromptChange(value);
    setSlashCommandOpen(value === "/");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter and Option+Enter insert a newline; plain Enter sends.
    if (event.key === "Enter" && (event.shiftKey || event.altKey)) {
      event.preventDefault();
      insertNewline(event.currentTarget);
      return;
    }
    if (event.key === "Enter" && !slashCommandOpen) {
      event.preventDefault();
      onRunAgent();
    }
    if (event.key === "Escape" && slashCommandOpen) {
      setSlashCommandOpen(false);
    }
  };

  const handleActionPickerOpenChange = (open: boolean) => {
    setActionPickerOpen(open);
    if (open) setModelPickerOpen(false);
  };

  const handleModelPickerOpenChange = (open: boolean) => {
    setModelPickerOpen(open);
    if (open) setActionPickerOpen(false);
  };

  const handleSelectAction = (selectedAction: AiActionId) => {
    onSelectAction(selectedAction);
    setActionPickerOpen(false);
  };

  const handleSelectSlashAction = (selectedAction: AiActionId) => {
    onSelectAction(selectedAction);
    onPromptChange("");
    setSlashCommandOpen(false);
  };

  return (
    <div className="shrink-0 border-t border-[var(--axon-panel-border)] bg-transparent p-3">
      <div className="relative rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-sm shadow-black/10 transition-colors focus-within:border-[var(--axon-syntax-function)]/45">
        <AgentComposerContextChips
          activeFilePath={activeFilePath}
          diagnostics={diagnostics}
          enabled={contextEnabled}
          gitChanges={gitChanges}
          onChange={setContextEnabled}
        />

        <textarea
          ref={textareaRef}
          value={prompt}
          disabled={!conversationReady || !canChat}
          onChange={(event) => handlePromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            !conversationReady
              ? "Loading conversation..."
              : !canChat
                ? "Model is not ready..."
                : slashCommandOpen
                  ? "Choose a command..."
                  : "Ask Axon anything..."
          }
          className="min-h-[40px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-5 text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30 disabled:cursor-default disabled:opacity-40"
          rows={1}
        />

        {slashCommandOpen && conversationReady && canChat && (
          <SlashCommandMenu
            onDismiss={() => setSlashCommandOpen(false)}
            onSelect={handleSelectSlashAction}
          />
        )}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--axon-panel-border)] px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            {modelRuntime.canManageModels && (
              <AgentModelPicker
                hostMemoryGB={modelRuntime.runtimeStatus?.memoryGB}
                models={modelRuntime.models}
                open={modelPickerOpen}
                selectedModel={modelRuntime.selectedModel}
                selectedModelAvailable={modelRuntime.selectedModelInstalled}
                selectedModelLabel={modelRuntime.selectedModelLabel}
                onOpenChange={handleModelPickerOpenChange}
                onSelect={modelRuntime.setSelectedModel}
              />
            )}
            <AgentComposerActionPicker
              action={action}
              disabled={!conversationReady || !canChat}
              open={actionPickerOpen}
              onOpenChange={handleActionPickerOpenChange}
              onSelect={handleSelectAction}
            />
          </div>
          {busy && activeStreamId ? (
            <button
              type="button"
              onClick={onCancelStream}
              className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--axon-danger-foreground)_35%,transparent)] bg-[color-mix(in_srgb,var(--axon-danger-foreground)_10%,transparent)] px-2.5 text-[11px] font-medium text-[var(--axon-danger-foreground)] transition-colors hover:bg-[color-mix(in_srgb,var(--axon-danger-foreground)_18%,transparent)]"
            >
              <StopCircle size={12} />
              Stop
            </button>
          ) : (
            <Tooltip label="Send message" side="top">
              <button
                type="button"
                onClick={onRunAgent}
                disabled={!conversationReady || !canChat || !prompt.trim()}
                aria-label="Send message"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--axon-syntax-function)] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-25"
              >
                <Send size={12} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      {folderPath && (
        <div
          className="mt-2 truncate px-1 text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-40"
          title={folderPath}
        >
          {folderPath}
        </div>
      )}
    </div>
  );
}
