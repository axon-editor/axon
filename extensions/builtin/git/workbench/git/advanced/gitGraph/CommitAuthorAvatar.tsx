import { useEffect, useState } from "react";
import { type GitHistoryCommit } from "@axon-editor/shared/git";

export default function CommitAuthorAvatar({
  commit,
  className,
}: {
  commit: GitHistoryCommit;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [commit.authorAvatarUrl]);

  if (commit.authorAvatarUrl && !failed) {
    return (
      <img
        src={commit.authorAvatarUrl}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full border border-[var(--axon-panel-border)] object-cover`}
      />
    );
  }

  const initials =
    commit.authorName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[8px] font-medium`}
    >
      {initials}
    </span>
  );
}
