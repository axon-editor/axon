export const MAX_TOOL_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;

export function isSafeArchiveEntry(entry: string) {
  const normalized = entry.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("\0")) return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return false;
  }
  return !normalized.split("/").some((part: string) => part === "..");
}
