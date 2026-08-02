export default function SpotifyWave({
  active,
  className = "",
  label,
}: {
  active: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`axon-spotify-wave ${active ? "axon-spotify-wave--active" : ""} ${className}`}
      aria-label={label ?? (active ? "Playing" : "Paused")}
      tabIndex={label ? 0 : undefined}
    >
      {[0, 1, 2, 3, 4].map((bar) => (
        <span key={bar} className="axon-spotify-wave__bar" />
      ))}
      {label ? (
        <span className="axon-spotify-wave__label">{label}</span>
      ) : null}
    </span>
  );
}
