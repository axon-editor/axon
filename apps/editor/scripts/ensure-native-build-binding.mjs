import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const requireFromEditor = createRequire(path.join(editorRoot, "package.json"));

const nativePackageGroups = [
  {
    name: "Rolldown",
    packageName: "rolldown",
    bindingByPlatform: {
      "darwin-arm64": "@rolldown/binding-darwin-arm64",
      "darwin-x64": "@rolldown/binding-darwin-x64",
      "linux-arm64": "@rolldown/binding-linux-arm64-gnu",
      "linux-x64": "@rolldown/binding-linux-x64-gnu",
      "win32-arm64": "@rolldown/binding-win32-arm64-msvc",
      "win32-x64": "@rolldown/binding-win32-x64-msvc",
    },
  },
  {
    name: "Lightning CSS",
    packageName: "lightningcss",
    bindingByPlatform: {
      "darwin-arm64": "lightningcss-darwin-arm64",
      "darwin-x64": "lightningcss-darwin-x64",
      "linux-arm64": "lightningcss-linux-arm64-gnu",
      "linux-x64": "lightningcss-linux-x64-gnu",
      "win32-arm64": "lightningcss-win32-arm64-msvc",
      "win32-x64": "lightningcss-win32-x64-msvc",
    },
  },
  {
    name: "Tailwind Oxide",
    packageName: "@tailwindcss/oxide",
    bindingByPlatform: {
      "darwin-arm64": "@tailwindcss/oxide-darwin-arm64",
      "darwin-x64": "@tailwindcss/oxide-darwin-x64",
      "linux-arm64": "@tailwindcss/oxide-linux-arm64-gnu",
      "linux-x64": "@tailwindcss/oxide-linux-x64-gnu",
      "win32-arm64": "@tailwindcss/oxide-win32-arm64-msvc",
      "win32-x64": "@tailwindcss/oxide-win32-x64-msvc",
    },
  },
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(editorRoot, "..", ".."),
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function resolvePackage(packageName) {
  try {
    return requireFromEditor.resolve(`${packageName}/package.json`);
  } catch {
    return null;
  }
}

const platformKey = `${process.platform}-${process.arch}`;
const packagesToInstall = [];

for (const group of nativePackageGroups) {
  const bindingPackage = group.bindingByPlatform[platformKey];
  if (!bindingPackage) {
    console.log(`No ${group.name} native binding is mapped for ${platformKey}.`);
    continue;
  }

  if (resolvePackage(bindingPackage)) {
    console.log(`${bindingPackage} is already installed.`);
    continue;
  }

  const owningPackagePath = resolvePackage(group.packageName);
  if (!owningPackagePath) {
    console.log(`${group.packageName} is not installed; skipping ${group.name}.`);
    continue;
  }

  const owningPackage = requireFromEditor(owningPackagePath);
  const bindingVersion = owningPackage.optionalDependencies?.[bindingPackage];
  if (!bindingVersion) {
    throw new Error(
      `${group.name} does not declare ${bindingPackage} as an optional dependency.`,
    );
  }

  packagesToInstall.push(`${bindingPackage}@${bindingVersion}`);
}

if (packagesToInstall.length === 0) {
  console.log(`All native build bindings are present for ${platformKey}.`);
  process.exit(0);
}

// npm's lockfile can miss optional native packages for platforms that were not
// present when the lock was created. CI builds every Axon platform from the same
// checkout, so this step repairs only the runner's native build dependencies.
// `--package-lock=false` keeps the release job from rewriting the lockfile while
// still placing the missing native .node files into node_modules for Vite.
console.log(`Installing missing native build bindings: ${packagesToInstall.join(", ")}`);
await run("npm", [
  "install",
  "--workspace",
  "axon",
  "--no-save",
  "--package-lock=false",
  "--include=optional",
  ...packagesToInstall,
]);
