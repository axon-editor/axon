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
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#1d2432] bg-[#0b0f17] p-4 transition-colors hover:border-[#2a3346] md:grid-cols-[210px_1fr] md:items-center">
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
      className={`h-9 w-full rounded-md border border-[#222838] bg-[#070a10] px-3 text-[12px] text-[#c8d0e0] outline-none transition-colors placeholder:text-[#3f485a] focus:border-[#80c8e0] ${
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
      className="flex w-fit cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-[#c8d0e0] transition-colors hover:bg-[#151923] disabled:cursor-not-allowed disabled:text-[#586478] disabled:hover:bg-transparent"
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
        className="h-9 w-20 rounded-md border border-[#222838] bg-[#070a10] px-2 text-[12px] text-[#c8d0e0] outline-none transition-colors focus:border-[#80c8e0]"
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
      <div className="rounded-xl border border-[#1d2432] bg-[#0b0f17] px-5 py-4">
        <h2 className="text-[16px] font-semibold text-white">{title}</h2>
        <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#7f8aa3]">
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
