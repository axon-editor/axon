export default function RefChip({ value }: { value: string }) {
  const isTag = value.startsWith("tag:");
  return (
    <span
      className={`max-w-40 truncate rounded border px-1.5 py-0.5 text-[10px] ${isTag ? "border-[#2c789f] bg-[#102937] text-[#8fd8fa]" : "border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-75"}`}
    >
      {value.replace(/^HEAD -> /, "")}
    </span>
  );
}
