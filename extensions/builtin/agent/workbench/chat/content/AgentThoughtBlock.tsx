/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import BrailleSpinner from "../indicators/BrailleSpinner";
import AssistantMarkdown from "./AssistantMarkdown";

interface Props {
  content: string;
  active?: boolean;
  onOpenLink?: (href: string) => void;
}

export default function AgentThoughtBlock({
  content,
  active = false,
  onOpenLink,
}: Props) {
  // Thoughts start expanded because they are the only place the agent's
  // planning text is visible. The user can collapse one after reading it
  // without losing the surrounding tool history.
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--axon-editor-foreground)] opacity-60 transition-opacity hover:opacity-100"
      >
        {active ? (
          <BrailleSpinner />
        ) : (
          <ChevronRight
            size={12}
            className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
        <span>{active ? "Thinking" : "Thought"}</span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--axon-panel-border)] px-3 py-2">
          <AssistantMarkdown content={content} onOpenLink={onOpenLink} />
        </div>
      )}
    </div>
  );
}
