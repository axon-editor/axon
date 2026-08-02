import { type GitBlameLine } from "../../../../shared/git";

function compactText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function formatLineTraceAge(authorTime: number, now = Date.now()) {
  if (authorTime <= 0) return "unknown";
  const elapsedSeconds = Math.max(0, Math.floor(now / 1000) - authorTime);
  if (elapsedSeconds < 60) return "now";
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m`;
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h`;
  if (elapsedSeconds < 604_800)
    return `${Math.floor(elapsedSeconds / 86_400)}d`;
  if (elapsedSeconds < 2_629_800) {
    return `${Math.floor(elapsedSeconds / 604_800)}w`;
  }
  if (elapsedSeconds < 31_557_600) {
    return `${Math.floor(elapsedSeconds / 2_629_800)}mo`;
  }
  return `${Math.floor(elapsedSeconds / 31_557_600)}y`;
}

export function createLineTraceLabel(line: GitBlameLine, now = Date.now()) {
  const author = compactText(line.authorName || "Unknown author", 24);
  const summary = compactText(line.summary || line.shortHash, 48);
  return `  ${author} · ${formatLineTraceAge(line.authorTime, now)} · ${summary}`;
}

export function createLineTraceHover(line: GitBlameLine) {
  const escapeMarkdown = (value: string) =>
    value.replace(/[\\`*_{}[\]()<>#+.!|-]/g, "\\$&");
  const author = escapeMarkdown(line.authorName || "Unknown author");
  const email = line.authorEmail
    ? ` <${escapeMarkdown(line.authorEmail)}>`
    : "";
  const summary = escapeMarkdown(line.summary || "No commit summary");
  const committedAt =
    line.authorTime > 0
      ? new Date(line.authorTime * 1000).toLocaleString()
      : "Unknown date";
  return `**${author}**${email}\n\n${summary}\n\n\`${line.shortHash}\` · ${committedAt}`;
}
