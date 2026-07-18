import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const platformKey = `${process.platform}-${process.arch}`;
const targetRoot = path.join(
  editorRoot,
  "build",
  "language-servers",
  platformKey,
  "go",
);
const runtimeRoot = path.join(targetRoot, "runtime");
const executableName = process.platform === "win32" ? "gopls.exe" : "gopls";
const wrapperName = process.platform === "win32" ? "gopls.cmd" : "gopls";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
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

async function writeWrapper(executablePath) {
  const binRoot = path.join(targetRoot, "bin");
  await fs.mkdir(binRoot, { recursive: true });
  const wrapperPath = path.join(binRoot, wrapperName);
  const relativeExecutable = path.relative(binRoot, executablePath);

  // Go is the one native language server intentionally baked into Axon. The
  // stable wrapper keeps main-process resolution independent from GOBIN's
  // platform filename while preserving the runtime tree used by release
  // verification and Electron packaging.
  if (process.platform === "win32") {
    await fs.writeFile(
      wrapperPath,
      `@echo off\r\n"%~dp0\\${relativeExecutable}" %*\r\n`,
      "utf8",
    );
    return;
  }

  await fs.writeFile(
    wrapperPath,
    `#!/usr/bin/env sh\nDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$DIR/${relativeExecutable}" "$@"\n`,
    { encoding: "utf8", mode: 0o755 },
  );
  await fs.chmod(executablePath, 0o755);
}

async function main() {
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(runtimeRoot, { recursive: true });

  console.log("go: building golang.org/x/tools/gopls@v0.22.0");
  await run("go", ["install", "golang.org/x/tools/gopls@v0.22.0"], {
    env: { ...process.env, GOBIN: runtimeRoot },
  });

  const executablePath = path.join(runtimeRoot, executableName);
  const executableStat = await fs.stat(executablePath).catch(() => null);
  if (!executableStat?.isFile()) {
    throw new Error(`go: go install did not produce ${executableName}`);
  }

  await writeWrapper(executablePath);
  console.log(`go: installed into ${path.relative(editorRoot, targetRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
