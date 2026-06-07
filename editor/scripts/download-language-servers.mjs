import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(editorRoot, "build", "language-servers");
const downloadRoot = path.join(editorRoot, ".language-server-downloads");

const currentPlatformKey = `${process.platform}-${process.arch}`;

const bundles = [
  {
    id: "go",
    goInstall: {
      module: "golang.org/x/tools/gopls@v0.22.0",
    },
    executableNames: ["gopls", "gopls.exe"],
    wrapperName: process.platform === "win32" ? "gopls.cmd" : "gopls",
  },
  {
    id: "rust",
    repository: "rust-lang/rust-analyzer",
    assetByPlatform: {
      "darwin-arm64": /^rust-analyzer-aarch64-apple-darwin\.gz$/,
      "darwin-x64": /^rust-analyzer-x86_64-apple-darwin\.gz$/,
      "linux-x64": /^rust-analyzer-x86_64-unknown-linux-gnu\.gz$/,
      "linux-arm64": /^rust-analyzer-aarch64-unknown-linux-gnu\.gz$/,
      "win32-x64": /^rust-analyzer-x86_64-pc-windows-msvc\.zip$/,
      "win32-arm64": /^rust-analyzer-aarch64-pc-windows-msvc\.zip$/,
    },
    executableNames: [
      "rust-analyzer",
      "rust-analyzer.exe",
      "rust-analyzer-aarch64-apple-darwin",
      "rust-analyzer-x86_64-apple-darwin",
      "rust-analyzer-aarch64-unknown-linux-gnu",
      "rust-analyzer-x86_64-unknown-linux-gnu",
    ],
    wrapperName:
      process.platform === "win32" ? "rust-analyzer.cmd" : "rust-analyzer",
  },
  {
    id: "cpp",
    repository: "clangd/clangd",
    assetByPlatform: {
      "darwin-arm64": /^clangd-mac-\d+\.\d+\.\d+\.zip$/,
      "darwin-x64": /^clangd-mac-\d+\.\d+\.\d+\.zip$/,
      "linux-x64": /^clangd-linux-\d+\.\d+\.\d+\.zip$/,
      "win32-x64": /^clangd-windows-\d+\.\d+\.\d+\.zip$/,
    },
    executableNames: ["clangd", "clangd.exe"],
    wrapperName: process.platform === "win32" ? "clangd.cmd" : "clangd",
  },
  {
    id: "java",
    openVsx: {
      namespace: "redhat",
      extension: "java",
    },
    executableNames: ["jdtls", "jdtls.bat"],
    wrapperName: process.platform === "win32" ? "jdtls.cmd" : "jdtls",
  },
  {
    id: "csharp",
    repository: "OmniSharp/omnisharp-roslyn",
    assetByPlatform: {
      "darwin-arm64": /^omnisharp-osx-arm64-net6\.0\.tar\.gz$/,
      "darwin-x64": /^omnisharp-osx-x64-net6\.0\.tar\.gz$/,
      "linux-x64": /^omnisharp-linux-x64-net6\.0\.tar\.gz$/,
      "linux-arm64": /^omnisharp-linux-arm64-net6\.0\.tar\.gz$/,
      "win32-x64": /^omnisharp-win-x64-net6\.0\.zip$/,
      "win32-arm64": /^omnisharp-win-arm64-net6\.0\.zip$/,
    },
    executableNames: ["OmniSharp", "omnisharp"],
    wrapperName: process.platform === "win32" ? "OmniSharp.cmd" : "OmniSharp",
  },
  {
    id: "kotlin",
    repository: "fwcd/kotlin-language-server",
    assetByPlatform: {
      "darwin-arm64": /^server\.zip$/,
      "darwin-x64": /^server\.zip$/,
      "linux-x64": /^server\.zip$/,
      "linux-arm64": /^server\.zip$/,
      "win32-x64": /^server\.zip$/,
      "win32-arm64": /^server\.zip$/,
    },
    executableNames: ["kotlin-language-server", "kotlin-language-server.bat"],
    wrapperName:
      process.platform === "win32"
        ? "kotlin-language-server.cmd"
        : "kotlin-language-server",
  },
  {
    id: "lua",
    repository: "LuaLS/lua-language-server",
    assetByPlatform: {
      "darwin-arm64": /darwin-arm64\.tar\.gz$/,
      "darwin-x64": /darwin-x64\.tar\.gz$/,
      "linux-x64": /linux-x64\.tar\.gz$/,
      "linux-arm64": /linux-arm64\.tar\.gz$/,
      "win32-x64": /win32-x64\.zip$/,
    },
    executableNames: ["lua-language-server", "lua-language-server.exe"],
    wrapperName:
      process.platform === "win32"
        ? "lua-language-server.cmd"
        : "lua-language-server",
  },
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

async function fetchJson(url) {
  const isGitHubApi = url.startsWith("https://api.github.com/");
  const response = await fetch(url, {
    headers: {
      Accept: isGitHubApi ? "application/vnd.github+json" : "application/json",
      "User-Agent": "Axon-Language-Server-Bundler",
    },
  });

  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Axon-Language-Server-Bundler",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`failed to download ${url}: ${response.status}`);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  const file = await fs.open(destination, "w");
  try {
    for await (const chunk of response.body) {
      await file.write(chunk);
    }
  } finally {
    await file.close();
  }
}

async function extractArchive(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  if (archivePath.endsWith(".gz") && !archivePath.endsWith(".tar.gz")) {
    const outputPath = path.join(
      destination,
      path.basename(archivePath, ".gz"),
    );
    await pipeline(
      createReadStream(archivePath),
      zlib.createGunzip(),
      createWriteStream(outputPath),
    );
    await fs.chmod(outputPath, 0o755);
    return;
  }

  if (archivePath.endsWith(".zip")) {
    if (process.platform === "win32") {
      await run("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
      ]);
      return;
    }

    await run("unzip", ["-q", archivePath, "-d", destination]);
    return;
  }

  await run("tar", ["-xzf", archivePath, "-C", destination]);
}

async function findExecutable(root, executableNames) {
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findExecutable(entryPath, executableNames);
      if (nested) return nested;
      continue;
    }

    if (entry.isFile() && executableNames.includes(entry.name)) {
      return entryPath;
    }
  }

  return null;
}

async function writeWrapper(bundle, targetRoot, executablePath) {
  const binDir = path.join(targetRoot, "bin");
  await fs.mkdir(binDir, { recursive: true });
  const wrapperPath = path.join(binDir, bundle.wrapperName);
  const relativeExecutable = path.relative(binDir, executablePath);

  if (process.platform === "win32") {
    await fs.writeFile(
      wrapperPath,
      `@echo off\r\n"%~dp0\\${relativeExecutable}" %*\r\n`,
    );
    return;
  }

  // The downloaded archives do not all share the same internal layout. Axon
  // keeps the original runtime tree intact under runtime/ and writes one stable
  // wrapper under bin/. The main process can then resolve every managed server
  // through the same path contract without depending on each upstream archive's
  // folder naming decisions.
  await fs.writeFile(
    wrapperPath,
    `#!/usr/bin/env sh\nDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$DIR/${relativeExecutable}" "$@"\n`,
    { mode: 0o755 },
  );
  await fs.chmod(wrapperPath, 0o755);
  await fs.chmod(executablePath, 0o755).catch(() => undefined);
}

async function resolveReleaseAsset(bundle, platformKey) {
  if (bundle.openVsx) {
    const metadata = await fetchJson(
      `https://open-vsx.org/api/${bundle.openVsx.namespace}/${bundle.openVsx.extension}/latest`,
    );

    return {
      releaseTag: metadata.version,
      name: `${bundle.openVsx.namespace}.${bundle.openVsx.extension}-${metadata.version}.vsix`,
      url: metadata.files.download,
    };
  }

  const pattern = bundle.assetByPlatform[platformKey];
  if (!pattern) return null;

  const release = await fetchJson(
    `https://api.github.com/repos/${bundle.repository}/releases/latest`,
  );
  const asset = release.assets?.find((candidate) => pattern.test(candidate.name));
  if (!asset) {
    throw new Error(
      `${bundle.id}: no release asset matched ${pattern} in ${bundle.repository}`,
    );
  }

  return {
    releaseTag: release.tag_name,
    name: asset.name,
    url: asset.browser_download_url,
  };
}

async function installBundle(bundle, platformKey) {
  if (bundle.goInstall) {
    const targetRoot = path.join(outputRoot, platformKey, bundle.id);
    const runtimeRoot = path.join(targetRoot, "runtime");
    await fs.rm(targetRoot, { recursive: true, force: true });
    await fs.mkdir(runtimeRoot, { recursive: true });

    console.log(`${bundle.id}: building ${bundle.goInstall.module}`);
    await run("go", ["install", bundle.goInstall.module], {
      env: {
        ...process.env,
        GOBIN: runtimeRoot,
      },
    });

    const executablePath = await findExecutable(
      runtimeRoot,
      bundle.executableNames,
    );
    if (!executablePath) {
      throw new Error(
        `${bundle.id}: go install did not produce ${bundle.executableNames.join(
          " or ",
        )}`,
      );
    }

    await writeWrapper(bundle, targetRoot, executablePath);
    console.log(`${bundle.id}: installed into ${path.relative(editorRoot, targetRoot)}`);
    return;
  }

  const asset = await resolveReleaseAsset(bundle, platformKey);
  if (!asset) {
    console.log(`${bundle.id}: no managed bundle configured for ${platformKey}`);
    return;
  }

  const archivePath = path.join(downloadRoot, bundle.id, asset.name);
  const extractRoot = path.join(downloadRoot, bundle.id, "extract");
  const targetRoot = path.join(outputRoot, platformKey, bundle.id);
  const runtimeRoot = path.join(targetRoot, "runtime");

  console.log(`${bundle.id}: downloading ${asset.name} (${asset.releaseTag})`);
  await downloadFile(asset.url, archivePath);
  await extractArchive(archivePath, runtimeRoot);

  const executablePath = await findExecutable(runtimeRoot, bundle.executableNames);
  if (!executablePath) {
    throw new Error(
      `${bundle.id}: could not find executable ${bundle.executableNames.join(
        " or ",
      )}`,
    );
  }

  await writeWrapper(bundle, targetRoot, executablePath);
  await fs.rm(extractRoot, { recursive: true, force: true });
  console.log(`${bundle.id}: installed into ${path.relative(editorRoot, targetRoot)}`);
}

async function main() {
  const selectedPlatform = currentPlatformKey;
  await fs.mkdir(outputRoot, { recursive: true });

  for (const bundle of bundles) {
    await installBundle(bundle, selectedPlatform);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
