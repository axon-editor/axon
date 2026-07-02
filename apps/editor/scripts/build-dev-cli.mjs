import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(editorRoot, "..", "..");
const coreRoot = path.join(repoRoot, "services", "core");
const outputDir = path.join(editorRoot, "build", "core");
const goCacheDir = path.join(repoRoot, ".cache", "go-build");
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const outputPath = path.join(outputDir, `axon${executableSuffix}`);

mkdirSync(outputDir, { recursive: true });
mkdirSync(goCacheDir, { recursive: true });

// `npm run dev` starts axon-core with `go run` so backend changes are picked up
// immediately, but the user-facing `axon` terminal companion is a separate
// binary. Building it here prevents the installed dev artifact from staying on
// an older CLI implementation while the desktop app is running newer source.
const result = spawnSync(
  "go",
  ["build", "-o", outputPath, "./cmd/axon-agent"],
  {
    cwd: coreRoot,
    env: {
      ...process.env,
      GOCACHE: process.env.GOCACHE || goCacheDir,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
