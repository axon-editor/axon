import fs from "fs";
import path from "path";
import ts from "typescript";

const MAX_TYPESCRIPT_PROJECT_CONFIGS = 256;
const IGNORED_PROJECT_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

export function isTypeScriptProjectConfig(fileName: string) {
  return /^(?:tsconfig|jsconfig)(?:\.[^/]+)*\.json$/i.test(fileName);
}

function isPathInsideDirectory(filePath: string, directoryPath: string) {
  const relativePath = path.relative(directoryPath, filePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export async function discoverTypeScriptProjectConfigs(workspacePath: string) {
  const workspaceRoot = path.resolve(workspacePath);
  const directories = [workspaceRoot];
  const configs: string[] = [];

  while (
    directories.length > 0 &&
    configs.length < MAX_TYPESCRIPT_PROJECT_CONFIGS
  ) {
    const directory = directories.pop();
    if (!directory) break;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isFile() && isTypeScriptProjectConfig(entry.name)) {
        configs.push(path.join(directory, entry.name));
        if (configs.length >= MAX_TYPESCRIPT_PROJECT_CONFIGS) break;
      }
    }

    // I push children in reverse order because the stack pops from the end.
    // This keeps discovery deterministic without replacing the iterative walk
    // with recursion that can overflow on deeply nested monorepos.
    for (const entry of entries.reverse()) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_PROJECT_DIRECTORIES.has(entry.name)) continue;
      directories.push(path.join(directory, entry.name));
    }
  }

  return configs.sort((left, right) => left.localeCompare(right));
}

export async function createTypeScriptExternalProjectsRequest(
  configPaths: string[],
) {
  const projects = [];
  for (const configPath of configPaths) {
    // Parsing a large config expands its include globs synchronously inside
    // TypeScript. I yield between configs so project discovery cannot starve
    // Electron's terminal, file watcher, or renderer IPC while Axon starts LSP.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) continue;

    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    );

    const configDirectory = path.dirname(configPath);
    const ownsFilesOutsideConfigDirectory = parsed.fileNames.some(
      (fileName) => !isPathInsideDirectory(fileName, configDirectory),
    );
    if (!ownsFilesOutsideConfigDirectory) continue;

    // I let TypeScript parse extends, files, include, exclude, paths, and every
    // compiler option instead of recreating tsconfig semantics in Axon. I only
    // bridge configs that own files outside their directory because tsserver
    // already discovers ordinary ancestor configs itself. This keeps startup
    // payloads small while fixing sibling-package ownership in monorepos.
    projects.push({
      projectFileName: `${configPath}.axon-external-project`,
      rootFiles: parsed.fileNames.map((fileName) => ({ fileName })),
      options: parsed.options,
      typeAcquisition: parsed.typeAcquisition,
    });
  }

  return {
    command: "typescript.tsserverRequest",
    arguments: [
      "openExternalProjects",
      {
        projects,
      },
      {
        executionTarget: 0,
        expectsResult: true,
        isAsync: false,
      },
    ],
  };
}
