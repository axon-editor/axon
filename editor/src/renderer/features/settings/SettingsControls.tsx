import { type ReactNode } from "react";

export function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-[var(--axon-panel-border)] py-5 md:grid-cols-[minmax(220px,280px)_1fr] md:items-center">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">{label}</div>
        {description ? (
          <div className="mt-1 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-55">
            {description}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SettingsTextInput({
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
      className={`h-9 w-full rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] outline-none transition-colors placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35 focus:border-[var(--axon-syntax-function)] ${
        monospace ? "font-mono" : ""
      }`}
    />
  );
}

export function SettingsToggle({
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
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      aria-pressed={checked}
      className="flex w-fit cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <span
        className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${
          checked
            ? "border-[#5f8298] bg-[#315f77]"
            : "border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]"
        }`}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-4 bg-[#c8d7df]"
              : "translate-x-0 bg-[#747982]"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function SettingsNumberSlider({
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
        className="flex-1 cursor-pointer accent-[#80c8e0]"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-20 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[12px] text-[var(--axon-editor-foreground)] outline-none transition-colors focus:border-[var(--axon-syntax-function)]"
      />
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="pb-4">
        <h2 className="text-[18px] font-semibold text-[var(--axon-editor-foreground)]">{title}</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-65">
          {description}
        </p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function isValidHexColor(value: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim());
}
