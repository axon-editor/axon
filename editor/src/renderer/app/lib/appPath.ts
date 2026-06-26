export function getPathBasename(path: string | null) {
  if (!path) return "workspace";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "workspace";
}

export function escapeCssString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
