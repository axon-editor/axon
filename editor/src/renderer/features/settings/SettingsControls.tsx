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
    <div className="grid grid-cols-[180px_1fr] items-center gap-4">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-[#c8d0e0]">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[11px] leading-4 text-[#586478]">
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
      className={`h-8 w-full rounded border border-[#222838] bg-[#0e1018] px-2 text-[12px] text-[#c8d0e0] outline-none transition-colors placeholder:text-[#3f485a] focus:border-[#80c8e0] ${
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
      className="flex w-fit cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12px] text-[#c8d0e0] transition-colors hover:bg-[#151923] disabled:cursor-not-allowed disabled:text-[#586478] disabled:hover:bg-transparent"
    >
      <span
        className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${
          checked
            ? "border-[#80c8e0] bg-[#153241]"
            : "border-[#2a3346] bg-[#0e1018]"
        }`}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-4 bg-[#80c8e0]"
              : "translate-x-0 bg-[#586478]"
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
        className="h-8 w-16 rounded border border-[#222838] bg-[#0e1018] px-2 text-[12px] text-[#c8d0e0] outline-none transition-colors focus:border-[#80c8e0]"
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
    <section className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#647086]">
          {description}
        </p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function isValidHexColor(value: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim());
}
