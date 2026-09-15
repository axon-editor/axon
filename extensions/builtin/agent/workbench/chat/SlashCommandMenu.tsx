/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  Bug,
  FileText,
  GitCommit,
  HelpCircle,
  Lightbulb,
  RefreshCw,
  Search,
} from "lucide-react";
import { type AiActionId } from "@axon-editor/shared/ai";

interface SlashCommandMenuProps {
  onSelect: (action: AiActionId) => void;
}

interface SlashCommand {
  id: AiActionId;
  label: string;
  description: string;
  icon: typeof HelpCircle;
}

const commands: SlashCommand[] = [
  { id: "ask", label: "Ask", description: "Ask a question", icon: HelpCircle },
  { id: "fix-problem", label: "Fix", description: "Fix a problem", icon: Bug },
  { id: "explain-selection", label: "Explain", description: "Explain code", icon: Lightbulb },
  { id: "refactor-selection", label: "Refactor", description: "Refactor code", icon: RefreshCw },
  { id: "review-git-diff", label: "Review", description: "Review git changes", icon: Search },
  { id: "draft-commit-message", label: "Commit", description: "Draft commit message", icon: GitCommit },
  { id: "generate-tests", label: "Test", description: "Generate tests", icon: FileText },
];

export default function SlashCommandMenu({ onSelect }: SlashCommandMenuProps) {
  return (
    <div className="absolute bottom-full left-0 z-30 mb-1 w-[220px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-2xl shadow-black/50">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-40">
        Commands
      </div>
      {commands.map((command) => {
        const Icon = command.icon;
        return (
          <button
            key={command.id}
            type="button"
            onClick={() => onSelect(command.id)}
            className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--axon-panel-overlay-hover)]"
          >
            <Icon size={13} className="shrink-0 text-[var(--axon-syntax-function)]" />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[var(--axon-editor-foreground)]">
                /{command.label}
              </div>
              <div className="text-[10px] text-[var(--axon-editor-foreground)] opacity-50">
                {command.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
