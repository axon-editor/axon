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
const packageJsonPath = path.join(editorRoot, "package.json");
const packageLockPath = path.join(editorRoot, "package-lock.json");

const nodeBackedLanguageServerPackages = [
  "@astrojs/language-server",
  "@mdx-js/language-server",
  "@prisma/language-server",
  "@tailwindcss/language-server",
  "@vue/language-server",
  "bash-language-server",
  "dockerfile-language-server-nodejs",
  "graphql-language-service-server",
  "intelephense",
  "pyright",
  "svelte-language-server",
  "typescript",
  "typescript-language-server",
  "vscode-langservers-extracted",
  "yaml-language-server",
];

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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function resolvePackageLockDependency(packages, dependencyName, fromPackagePath) {
  const parts = fromPackagePath.split("/");

  for (;;) {
    const nodeModulesIndex = parts.lastIndexOf("node_modules");
    const base =
      nodeModulesIndex >= 0
        ? parts.slice(0, nodeModulesIndex + 1).join("/")
        : "node_modules";
    const candidate = `${base}/${dependencyName}`;
    if (packages[candidate]) return candidate;

    if (nodeModulesIndex < 0) return null;
    parts.splice(nodeModulesIndex, parts.length - nodeModulesIndex);
  }
}

function collectNodeBackedLanguageServerPackages(packageLock) {
  const packages = packageLock.packages ?? {};
  const seen = new Set();

  function walk(packageLockPath) {
    if (!packageLockPath || seen.has(packageLockPath)) return;
    const entry = packages[packageLockPath];
    if (!entry) return;

    seen.add(packageLockPath);
    for (const dependencyField of ["dependencies", "peerDependencies"]) {
      for (const dependencyName of Object.keys(entry[dependencyField] ?? {})) {
        walk(
          resolvePackageLockDependency(
            packages,
            dependencyName,
            packageLockPath,
          ),
        );
      }
    }
  }

  for (const packageName of nodeBackedLanguageServerPackages) {
    walk(`node_modules/${packageName}`);
  }

  return [...seen].sort((left, right) => left.localeCompare(right));
}

async function verifyNodeBackedLanguageServerPackaging() {
  const [packageJson, packageLock] = await Promise.all([
    readJson(packageJsonPath),
    readJson(packageLockPath),
  ]);
  const requiredPatterns = collectNodeBackedLanguageServerPackages(
    packageLock,
  ).map((packageLockPath) => `${packageLockPath}/**/*`);
  const files = new Set(packageJson.build?.files ?? []);
  const missingFiles = requiredPatterns.filter((pattern) => !files.has(pattern));

  // Node-backed language servers are pure JavaScript entry points, so they can
  // run from app.asar and resolve their dependencies there. The important
  // release invariant is that the complete package-lock dependency closure is
  // present in build.files; unpacking the whole closure would make Axon's app
  // bundle unnecessarily large without fixing module resolution.
  if (missingFiles.length > 0) {
    throw new Error(
      [
        "npm language-server packaging is incomplete.",
        missingFiles.length
          ? `Missing from build.files: ${missingFiles.slice(0, 20).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  console.log(
    `verified ${requiredPatterns.length} npm language-server package patterns`,
  );
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

  await verifyNodeBackedLanguageServerPackaging();

  console.log(`verified managed language servers for ${platformKey}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
