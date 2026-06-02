import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(editorRoot, "..");
const coreRoot = path.join(repoRoot, "core");
const outputDir = path.join(editorRoot, "build", "core");
const outputName = process.platform === "win32" ? "axon-core.exe" : "axon-core";
const outputPath = path.join(outputDir, outputName);

mkdirSync(outputDir, { recursive: true });

// The Electron package needs a real axon-core binary inside resources, not a
// source checkout that depends on Go being installed on the user's machine.
// Building from this script keeps the package.json commands cross-platform:
// each GitHub runner compiles the binary for its own OS and electron-builder
// then copies that exact binary into the desktop app.
const result = spawnSync("go", ["build", "-o", outputPath, "./cmd/axon"], {
  cwd: coreRoot,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
