/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memo, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import BrailleSpinner from "../../../indicators/BrailleSpinner";
import AssistantMarkdown from "../../markdown/components/AssistantMarkdown";

interface Props {
  content: string;
  active?: boolean;
  onOpenLink?: (href: string) => void;
}

function AgentThoughtBlock({ content, active = false, onOpenLink }: Props) {
  // Thinking is visible while it streams, then collapses to a single row so the
  // finished answer and tool history stay readable. A manual toggle wins over
  // the automatic state for the rest of this block's life.
  const [expanded, setExpanded] = useState(active);
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (active) {
      setExpanded(true);
      userToggledRef.current = false;
      return;
    }
    if (!userToggledRef.current) setExpanded(false);
  }, [active]);

  const toggleExpanded = () => {
    userToggledRef.current = true;
    setExpanded((current) => !current);
  };

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
      <button
        type="button"
        onClick={toggleExpanded}
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

export default memo(AgentThoughtBlock);
