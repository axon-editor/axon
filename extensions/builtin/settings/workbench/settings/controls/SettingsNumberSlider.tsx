/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Numeric slider paired with a typed value box. The native range input keeps a
// keyboard-accessible drag and the number box gives exact entry; both stay in
// sync through the same onChange. The accent thumb comes from the theme rather
// than a hard-coded blue so light and overridden themes keep a visible handle.
export default function SettingsNumberSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 cursor-pointer accent-[var(--axon-accent)]"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-20 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[12px] text-[var(--axon-editor-foreground)] outline-none transition-colors focus:border-[var(--axon-accent)]"
      />
    </div>
  );
}