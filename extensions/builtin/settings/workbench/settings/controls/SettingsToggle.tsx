/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A row-preserving checkbox replacement. The track reads as a genuine switch:
// on shows the theme accent with a high-contrast knob derived from that accent,
// off shows a faint editorial track so the control never looks like a filled
// button. The translated knob intentionally keeps its animate/transition-free
// feel so toggling is instant instead of adding motion to every setting row.
export default function SettingsToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className="flex w-fit cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <span
        className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${
          checked
            ? "border-[var(--axon-accent)] bg-[var(--axon-accent)]"
            : "border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)]"
        }`}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-4 bg-[var(--axon-accent-foreground)]"
              : "translate-x-0 bg-[var(--axon-editor-foreground)] opacity-45"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}