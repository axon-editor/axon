import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const platformKey = `${process.platform}-${process.arch}`;
const languageServerRoot = path.join(
  editorRoot,
  "build",
  "language-servers",
  platformKey,
);

const managedBundles = [
  { id: "go", executable: process.platform === "win32" ? "gopls.cmd" : "gopls" },
];

async function isFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  return Boolean(stat?.isFile());
}

async function main() {
  if (process.env.AXON_SKIP_LANGUAGE_SERVER_CHECK === "1") {
    return;
  }

  const missingBundles = [];

  for (const bundle of managedBundles) {
    const wrapperPath = path.join(
      languageServerRoot,
      bundle.id,
      "bin",
      bundle.executable,
    );
    if (!(await isFile(wrapperPath))) {
      missingBundles.push(bundle.id);
    }
  }

  if (missingBundles.length === 0) {
    return;
  }

  const relativeRoot = path.relative(editorRoot, languageServerRoot);

  // The language-server bundles are intentionally generated instead of
  // committed because each platform carries native binaries and upstream
  // runtime trees. Without this guard, a fresh clone falls through to PATH
  // lookup and makes Go/Rust/C++ look broken even though the real issue is that
  // the local development bundle has not been created yet.
  console.error(
    [
      "Axon's managed language-server bundle is missing for this machine.",
      "",
      `Missing: ${missingBundles.join(", ")}`,
      `Expected platform root: ${relativeRoot}`,
      "",
      "Run this once before development:",
      "",
      "  npm run build:language-servers",
      "",
      "Release builds do this in GitHub Actions before packaging. Local dev",
      "does it explicitly so the repo does not commit hundreds of megabytes of",
      "generated native language-server binaries.",
      "",
      "To start Axon without managed LSPs, set:",
      "",
      "  AXON_SKIP_LANGUAGE_SERVER_CHECK=1",
    ].join("\n"),
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
