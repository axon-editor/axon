/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EditorDiagnostic } from "@axon-editor/shared/editor/language/diagnostics";
import { type GitChange } from "@axon-editor/shared/workspace/git";
import ContextChip from "../../../chat/composer/ContextChip";
import { type ContextEnabled } from "../model/contextEnabled";

interface Props {
  activeFilePath: string | null;
  diagnostics: EditorDiagnostic[];
  enabled: ContextEnabled;
  gitChanges: GitChange[];
  onChange: (next: ContextEnabled) => void;
}

export default function AgentComposerContextChips({
  activeFilePath,
  diagnostics,
  enabled,
  gitChanges,
  onChange,
}: Props) {
  const showActiveFile = enabled.activeFile && Boolean(activeFilePath);
  const showDiagnostics = enabled.diagnostics && diagnostics.length > 0;
  const showGitChanges = enabled.gitChanges && gitChanges.length > 0;

  if (!showActiveFile && !showDiagnostics && !showGitChanges) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-[var(--axon-panel-border)] px-3 py-2">
      {showActiveFile && activeFilePath && (
        <ContextChip
          label={activeFilePath.split("/").pop() ?? activeFilePath}
          onRemove={() => onChange({ ...enabled, activeFile: false })}
        />
      )}
      {showDiagnostics && (
        <ContextChip
          label={`${diagnostics.length} problems`}
          onRemove={() => onChange({ ...enabled, diagnostics: false })}
        />
      )}
      {showGitChanges && (
        <ContextChip
          label={`${gitChanges.length} changes`}
          onRemove={() => onChange({ ...enabled, gitChanges: false })}
        />
      )}
    </div>
  );
}
