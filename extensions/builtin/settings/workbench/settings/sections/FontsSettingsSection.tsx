/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Trash2, Upload } from "lucide-react";
import { type AxonSettings } from "@axon-editor/shared/settings";
import SettingsButton from "../controls/SettingsButton";
import SettingsSection from "../controls/SettingsSection";

type UpdateEditor = <K extends keyof AxonSettings["editor"]>(
  key: K,
  value: AxonSettings["editor"][K],
) => void;

export default function FontsSettingsSection({
  draft,
  fontImportError,
  onImportFont,
  onRemoveFont,
  onUpdateEditor,
}: {
  draft: AxonSettings;
  fontImportError: string | null;
  onImportFont: () => void;
  onRemoveFont: (family: string) => void;
  onUpdateEditor: UpdateEditor;
}) {
  return (
    <SettingsSection>
      <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
              Import font file
            </div>
            <div className="mt-1 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
              Axon copies imported fonts into app storage so the original file
              can move without breaking settings.
            </div>
          </div>
          <SettingsButton
            label="Import"
            icon={<Upload size={13} />}
            tone="primary"
            onClick={onImportFont}
          />
        </div>
      </div>

      {draft.customFonts.length === 0 ? (
        <>
          <div className="rounded-md border border-dashed border-[var(--axon-panel-border)] px-4 py-8 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            No custom fonts imported yet.
          </div>
          {fontImportError && (
            <div className="text-[12px] text-[var(--axon-danger-foreground)]">
              {fontImportError}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {fontImportError && (
            <div className="text-[12px] text-[var(--axon-danger-foreground)]">
              {fontImportError}
            </div>
          )}
          {draft.customFonts.map((font) => (
            <div
              key={font.family}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2"
            >
              <div className="min-w-0">
                <div
                  className="truncate text-[13px] text-[var(--axon-editor-foreground)]"
                  style={{ fontFamily: `"${font.family}", sans-serif` }}
                >
                  {font.family}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {font.path}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <SettingsButton
                  label="UI"
                  tone="ghost"
                  onClick={() => onUpdateEditor("uiFontFamily", font.family)}
                />
                <SettingsButton
                  label="Editor"
                  tone="ghost"
                  onClick={() => onUpdateEditor("fontFamily", font.family)}
                />
                <SettingsButton
                  label="Both"
                  tone="ghost"
                  onClick={() => {
                    onUpdateEditor("uiFontFamily", font.family);
                    onUpdateEditor("fontFamily", font.family);
                  }}
                />
                <SettingsButton
                  label={`Remove ${font.family}`}
                  icon={<Trash2 size={13} />}
                  tone="danger"
                  iconOnly
                  ariaLabel={`Remove ${font.family}`}
                  onClick={() => onRemoveFont(font.family)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}