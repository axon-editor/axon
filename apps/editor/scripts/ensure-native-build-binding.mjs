import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const requireFromEditor = createRequire(path.join(editorRoot, "package.json"));

const bindingByPlatform = {
  "darwin-arm64": "@rolldown/binding-darwin-arm64",
  "darwin-x64": "@rolldown/binding-darwin-x64",
  "linux-arm64": "@rolldown/binding-linux-arm64-gnu",
  "linux-x64": "@rolldown/binding-linux-x64-gnu",
  "win32-arm64": "@rolldown/binding-win32-arm64-msvc",
  "win32-x64": "@rolldown/binding-win32-x64-msvc",
};

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
const bindingPackage = bindingByPlatform[platformKey];

if (!bindingPackage) {
  console.log(`No Rolldown native binding is mapped for ${platformKey}.`);
  process.exit(0);
}

if (resolvePackage(bindingPackage)) {
  console.log(`${bindingPackage} is already installed.`);
  process.exit(0);
}

const rolldownPackagePath = resolvePackage("rolldown");
if (!rolldownPackagePath) {
  throw new Error("Cannot locate rolldown; run npm ci before this script.");
}

const rolldownPackage = requireFromEditor(rolldownPackagePath);
const bindingVersion = rolldownPackage.optionalDependencies?.[bindingPackage];
if (!bindingVersion) {
  throw new Error(
    `Rolldown does not declare ${bindingPackage} as an optional dependency.`,
  );
}

// npm's lockfile can miss optional native packages for platforms that were not
// present when the lock was created. CI builds all Axon platforms from the same
// checkout, so this step repairs only the runner's native binding without
// changing package.json or package-lock.json.
console.log(`Installing missing native build binding ${bindingPackage}@${bindingVersion}`);
await run("npm", [
  "install",
  "--workspace",
  "axon",
  "--no-save",
  "--include=optional",
  `${bindingPackage}@${bindingVersion}`,
]);
