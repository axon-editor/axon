import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(editorRoot, "..", ".."),
      shell: process.platform === "win32",
      stdio: "inherit",
      ...options,
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

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(editorRoot, "..", ".."),
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "inherit"],
      ...options,
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
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

function nodeModulesPackagePath(packageName) {
  return path.join(editorRoot, "node_modules", ...packageName.split("/"));
}

async function installPackedPackage(packageSpec) {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "axon-native-binding-"),
  );

  try {
    const packOutput = await runCapture("npm", [
      "pack",
      "--silent",
      "--pack-destination",
      tempRoot,
      packageSpec,
    ]);
    const archiveName = packOutput.split(/\r?\n/).filter(Boolean).at(-1);
    if (!archiveName) {
      throw new Error(`npm pack did not report an archive for ${packageSpec}`);
    }

    const archivePath = path.isAbsolute(archiveName)
      ? archiveName
      : path.join(tempRoot, archiveName);
    const extractRoot = path.join(tempRoot, "extract");
    await fs.mkdir(extractRoot, { recursive: true });
    await run("tar", ["-xzf", archivePath, "-C", extractRoot]);

    const packageName = packageSpec.replace(/@[^@]+$/, "");
    const sourcePath = path.join(extractRoot, "package");
    const destinationPath = nodeModulesPackagePath(packageName);

    // I avoid `npm install` here because the release workflow has already run
    // `npm ci` for the full workspace. Running another install inside one
    // workspace lets npm recalculate hoisting and prune app dependencies, which
    // is exactly how the Linux and arm64 jobs lost normal packages like React.
    // Packing and extracting the missing native package is deliberately narrow:
    // it places the required .node binding where the owning package expects it
    // without touching the rest of node_modules or the lockfile.
    await fs.rm(destinationPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.cp(sourcePath, destinationPath, { recursive: true });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
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
console.log(`Installing missing native build bindings: ${packagesToInstall.join(", ")}`);
for (const packageSpec of packagesToInstall) {
  await installPackedPackage(packageSpec);
}
