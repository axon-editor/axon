import { type GitGraphCommit } from "@axon-editor/shared/git";

const colors = ["#33a7e8", "#e5b95c", "#42b883", "#9d90fc", "#e26d78"];

export default function GraphLane({
  commit,
  laneCount,
}: {
  commit: GitGraphCommit;
  laneCount: number;
}) {
  const laneWidth = 15;
  const width = Math.max(laneCount, 1) * laneWidth;
  const x = commit.lane * laneWidth + laneWidth / 2;
  return (
    <svg
      width={width}
      height="34"
      viewBox={`0 0 ${width} 34`}
      aria-hidden="true"
    >
      {Array.from({ length: laneCount }).map((_, lane) => (
        <line
          key={lane}
          x1={lane * laneWidth + laneWidth / 2}
          y1="0"
          x2={lane * laneWidth + laneWidth / 2}
          y2="34"
          stroke={colors[lane % colors.length]}
          strokeOpacity={lane === commit.lane ? 0.62 : 0.2}
          strokeWidth="1.4"
        />
      ))}
      {commit.parents.slice(1, 3).map((_, index) => (
        <path
          key={index}
          d={`M ${x} 17 C ${x + 8 + index * 8} 20, ${x + 8 + index * 8} 28, ${x + 15 + index * 8} 34`}
          fill="none"
          stroke={colors[commit.lane % colors.length]}
          strokeOpacity="0.5"
          strokeWidth="1.4"
        />
      ))}
      <circle
        cx={x}
        cy="17"
        r="3.6"
        fill={colors[commit.lane % colors.length]}
      />
    </svg>
  );
}
