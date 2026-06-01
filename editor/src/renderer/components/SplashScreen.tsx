interface SplashScreenProps {
  leaving: boolean;
}

const titleLetters = ["A", "X", "O", "N"];

export default function SplashScreen({ leaving }: SplashScreenProps) {
  return (
    <div
      className={`axon-splash ${leaving ? "axon-splash--leaving" : ""}`}
      aria-label="Opening Axon"
      role="status"
    >
      <div className="axon-splash__mark-wrap">
        <div className="axon-splash__aura" />
        <img className="axon-splash__mark" src="/axon.png" alt="" />
      </div>

      <div className="axon-splash__wordmark" aria-hidden="true">
        <div className="axon-splash__title">
          {titleLetters.map((letter, index) => (
            <span
              key={letter}
              style={{ animationDelay: `${1.25 + index * 0.16}s` }}
            >
              {letter}
            </span>
          ))}
        </div>
        <div className="axon-splash__wordline" />
      </div>
    </div>
  );
}
