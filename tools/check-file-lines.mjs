import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const baselinePath = path.join(import.meta.dirname, "line-count-baseline.json");
const maxLines = 1000;
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const roots = ["apps", "packages", "services", "extensions"];
const ignoredSegments = new Set([
  "node_modules",
  "dist",
  "release",
  "build",
  ".language-server-downloads",
  "public",
]);
const checkedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".go",
  ".json",
  ".mjs",
  ".md",
]);

function shouldSkip(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return relative.split(path.sep).some((segment) => ignoredSegments.has(segment));
}

function walk(currentPath, files) {
  if (!fs.existsSync(currentPath) || shouldSkip(currentPath)) return;
  const stat = fs.statSync(currentPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), files);
    }
    return;
  }
  if (!checkedExtensions.has(path.extname(currentPath))) return;
  files.push(currentPath);
}

const files = [];
for (const root of roots) {
  walk(path.join(repoRoot, root), files);
}

const offenders = files
  .map((filePath) => ({
    filePath,
    relativePath: path.relative(repoRoot, filePath),
    lineCount: fs.readFileSync(filePath, "utf8").split(/\r?\n/).length,
  }))
  .filter((entry) => {
    const allowedLineCount = baseline[entry.relativePath];
    if (typeof allowedLineCount === "number") {
      // A small baseline lets this tool land before every old large file has
      // been split. The important enforcement is that known offenders cannot
      // grow, and newly-created files still have to stay below the default
      // file-size ceiling.
      return entry.lineCount > allowedLineCount;
    }
    return entry.lineCount > maxLines;
  })
  .sort((left, right) => right.lineCount - left.lineCount);

if (offenders.length > 0) {
  for (const offender of offenders) {
    const baselineLineCount = baseline[offender.relativePath];
    const limit =
      typeof baselineLineCount === "number" ? baselineLineCount : maxLines;
    console.error(
      `${offender.relativePath} has ${offender.lineCount} lines; limit is ${limit}.`,
    );
  }
  process.exit(1);
}

console.log(
  `Checked ${files.length} files; no file exceeds the active line-count limits.`,
);
