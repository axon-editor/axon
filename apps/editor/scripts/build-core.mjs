import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(editorRoot, "..", "..");
const coreRoot = path.join(repoRoot, "services", "core");
const outputDir = path.join(editorRoot, "build", "core");
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const builds = [
  {
    packagePath: "./cmd/axon",
    outputName: `axon-core${executableSuffix}`,
  },
  {
    packagePath: "./cmd/axon-agent",
    outputName: `axon${executableSuffix}`,
  },
];

mkdirSync(outputDir, { recursive: true });

// The Electron package needs a real axon-core binary inside resources, not a
// source checkout that depends on Go being installed on the user's machine.
// Building from this script keeps the package.json commands cross-platform:
// each GitHub runner compiles the binary for its own OS and electron-builder
// then copies that exact binary into the desktop app.
for (const build of builds) {
  const outputPath = path.join(outputDir, build.outputName);
  const result = spawnSync("go", ["build", "-o", outputPath, build.packagePath], {
    cwd: coreRoot,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
