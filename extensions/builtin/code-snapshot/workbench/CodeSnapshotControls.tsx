import { type ReactNode } from "react";
import { Check, Copy, Download } from "lucide-react";
import { type CodeSnapshotPalette } from "./lib/renderCodeSnapshot";

export interface SnapshotPaletteOption extends CodeSnapshotPalette {
  id: string;
  label: string;
}

function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-[var(--axon-panel-border)] py-4 last:border-b-0">
      <div className="mb-2 text-[11px] font-medium uppercase text-[var(--axon-editor-foreground)] opacity-55">
        {label}
      </div>
      {children}
    </div>
  );
}

export function SnapshotToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-2 text-left text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
    >
      <span>{label}</span>
      <span
        className={`grid h-5 w-5 place-items-center rounded border ${
          checked
            ? "border-[#5f8298] bg-[#315f77] text-[#d8e5eb]"
            : "border-[var(--axon-panel-border)] text-transparent"
        }`}
      >
        <Check size={13} />
      </span>
    </button>
  );
}

export function SnapshotSlider({
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label className="block py-2 text-[12px] text-[var(--axon-editor-foreground)]">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-mono opacity-55">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full cursor-pointer accent-[#80c8e0]"
      />
    </label>
  );
}

export function CodeSnapshotControls({
  copied,
  endLine,
  fontSize,
  onCopy,
  onEndLineChange,
  onFileNameChange,
  onFontSizeChange,
  onPaddingChange,
  onPaletteChange,
  onSave,
  onShowFileNameChange,
  onShowLineNumbersChange,
  onStartLineChange,
  onWidthChange,
  padding,
  paletteId,
  palettes,
  renderReady,
  showFileName,
  showLineNumbers,
  startLine,
  fileName,
  width,
}: {
  copied: boolean;
  endLine: number;
  fileName: string;
  fontSize: number;
  onCopy: () => void;
  onEndLineChange: (value: number) => void;
  onFileNameChange: (value: string) => void;
  onFontSizeChange: (value: number) => void;
  onPaddingChange: (value: number) => void;
  onPaletteChange: (value: string) => void;
  onSave: () => void;
  onShowFileNameChange: (value: boolean) => void;
  onShowLineNumbersChange: (value: boolean) => void;
  onStartLineChange: (value: number) => void;
  onWidthChange: (value: number) => void;
  padding: number;
  paletteId: string;
  palettes: SnapshotPaletteOption[];
  renderReady: boolean;
  showFileName: boolean;
  showLineNumbers: boolean;
  startLine: number;
  width: number;
}) {
  const inputClass =
    "h-9 w-full rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[12px] text-[var(--axon-editor-foreground)] outline-none focus:border-[var(--axon-syntax-function)]";

  return (
    <aside className="h-full w-72 shrink-0 overflow-y-auto border-r border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-4">
      <ControlGroup label="Source">
        <input
          value={fileName}
          onChange={(event) => onFileNameChange(event.target.value)}
          aria-label="Snapshot filename"
          className={inputClass}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
            Start line
            <input
              type="number"
              min={1}
              value={startLine}
              onChange={(event) => onStartLineChange(Number(event.target.value))}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
            End line
            <input
              type="number"
              min={startLine}
              value={endLine}
              onChange={(event) => onEndLineChange(Number(event.target.value))}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      </ControlGroup>

      <ControlGroup label="Presentation">
        <SnapshotToggle
          checked={showFileName}
          label="Filename bar"
          onChange={onShowFileNameChange}
        />
        <SnapshotToggle
          checked={showLineNumbers}
          label="Line numbers"
          onChange={onShowLineNumbersChange}
        />
        <SnapshotSlider
          label="Font size"
          min={14}
          max={32}
          value={fontSize}
          onChange={onFontSizeChange}
        />
        <SnapshotSlider
          label="Padding"
          min={16}
          max={96}
          step={4}
          value={padding}
          onChange={onPaddingChange}
        />
        <SnapshotSlider
          label="Image width"
          min={640}
          max={1600}
          step={40}
          value={width}
          onChange={onWidthChange}
        />
      </ControlGroup>

      <ControlGroup label="Background">
        <div className="flex flex-wrap gap-2">
          {palettes.map((palette) => (
            <button
              key={palette.id}
              type="button"
              title={palette.label}
              aria-label={`${palette.label} background`}
              aria-pressed={palette.id === paletteId}
              onClick={() => onPaletteChange(palette.id)}
              className={`h-8 w-8 cursor-pointer rounded border-2 transition-transform hover:scale-105 ${
                palette.id === paletteId
                  ? "border-[#80c8e0]"
                  : "border-white/10"
              }`}
              style={{ background: palette.background }}
            />
          ))}
        </div>
      </ControlGroup>

      <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] py-4">
        <button
          type="button"
          disabled={!renderReady}
          onClick={onCopy}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded border border-[var(--axon-panel-border)] text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-wait disabled:opacity-45"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy PNG"}
        </button>
        <button
          type="button"
          disabled={!renderReady}
          onClick={onSave}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded bg-[#d8e5eb] text-[12px] font-medium text-[#0d1016] transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-45"
        >
          <Download size={14} />
          Save PNG
        </button>
      </div>
    </aside>
  );
}
