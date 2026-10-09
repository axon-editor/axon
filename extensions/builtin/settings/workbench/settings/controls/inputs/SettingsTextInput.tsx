/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plain text field shared by the background path, Python environment, and
// interpreter inputs. Monospace text aligns with the paths users copy from a
// terminal, while the focus border borrows the theme accent to signal edit.
export default function SettingsTextInput({
  value,
  onChange,
  placeholder,
  monospace,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  monospace?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`h-9 w-full rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] outline-none transition-colors placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35 focus:border-[var(--axon-accent)] ${
        monospace ? "font-mono" : ""
      }`}
    />
  );
}