export default function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-60">
      <span className="flex h-5 items-end gap-0.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-[var(--axon-syntax-function)] opacity-40"
            style={{
              animation: "axon-agent-pulse 1.1s ease-in-out infinite",
              animationDelay: `${index * 120}ms`,
            }}
          />
        ))}
      </span>
      <span>Reading context and writing...</span>
    </div>
  );
}
