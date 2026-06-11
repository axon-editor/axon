import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const platformKey = process.argv[2] || `${process.platform}-${process.arch}`;
const languageServerRoot = path.join(
  editorRoot,
  "build",
  "language-servers",
  platformKey,
);

const managedBundles = [
  { id: "go", executable: platformKey.startsWith("win32") ? "gopls.cmd" : "gopls" },
  {
    id: "rust",
    executable: platformKey.startsWith("win32")
      ? "rust-analyzer.cmd"
      : "rust-analyzer",
  },
  { id: "cpp", executable: platformKey.startsWith("win32") ? "clangd.cmd" : "clangd" },
  { id: "java", executable: platformKey.startsWith("win32") ? "jdtls.cmd" : "jdtls" },
  {
    id: "csharp",
    executable: platformKey.startsWith("win32") ? "OmniSharp.cmd" : "OmniSharp",
  },
  {
    id: "kotlin",
    executable: platformKey.startsWith("win32")
      ? "kotlin-language-server.cmd"
      : "kotlin-language-server",
  },
  {
    id: "lua",
    executable: platformKey.startsWith("win32")
      ? "lua-language-server.cmd"
      : "lua-language-server",
  },
];

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`${label} missing at ${path.relative(editorRoot, filePath)}`);
  }
}

async function verifyBundle(bundle) {
  const bundleRoot = path.join(languageServerRoot, bundle.id);
  const wrapperPath = path.join(bundleRoot, "bin", bundle.executable);
  const runtimeRoot = path.join(bundleRoot, "runtime");

  // Axon's runtime resolver depends on one stable wrapper under bin/ and the
  // downloaded upstream server tree under runtime/. Verifying both catches the
  // release failure where a download succeeds but the packaged app ships no
  // startable server for completions.
  await assertFile(wrapperPath, `${bundle.id} wrapper`);
  const runtimeStat = await fs.stat(runtimeRoot).catch(() => null);
  if (!runtimeStat?.isDirectory()) {
    throw new Error(
      `${bundle.id} runtime missing at ${path.relative(editorRoot, runtimeRoot)}`,
    );
  }
}

async function main() {
  const rootStat = await fs.stat(languageServerRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(
      `language server platform root missing at ${path.relative(
        editorRoot,
        languageServerRoot,
      )}`,
    );
  }

  for (const bundle of managedBundles) {
    await verifyBundle(bundle);
  }

  console.log(`verified managed language servers for ${platformKey}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
