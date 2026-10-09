/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared action button for the settings surfaces. Background image picking,
// Python environment selection, and the Language Tools rows all repeated the
// same bordered-button classes before this existed; consolidating them keeps
// destructive and secondary actions visually consistent too:
//
//   primary - bordered, accent focus with a soft hover tint
//   ghost   - quiet text action, gains a hover fill
//   danger  - destructive text action that tints red on hover
//
// iconOnly shrinks the hit target to a square for the font-row trash button.
import { type ReactNode } from "react";

type SettingsButtonTone = "primary" | "ghost" | "danger";

const BASE_CLASS =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors disabled:cursor-not-allowed disabled:opacity-35";

const TONE_CLASS: Record<SettingsButtonTone, string> = {
  primary:
    "border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] hover:border-[var(--axon-accent)] hover:bg-[var(--axon-editor-background)]",
  ghost:
    "opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:hover:bg-transparent",
  danger:
    "opacity-55 hover:bg-[var(--axon-danger-background)] hover:text-[var(--axon-danger-foreground)] hover:opacity-100 disabled:hover:bg-transparent",
};

export default function SettingsButton({
  label,
  onClick,
  icon,
  tone = "primary",
  disabled = false,
  iconOnly = false,
  ariaLabel,
  title,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  tone?: SettingsButtonTone;
  disabled?: boolean;
  iconOnly?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (iconOnly ? label : undefined)}
      title={title ?? (iconOnly ? label : undefined)}
      className={`${BASE_CLASS} ${TONE_CLASS[tone]} ${iconOnly ? "h-8 w-8 px-0" : ""}`}
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}