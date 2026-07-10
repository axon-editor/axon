import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestItem,
  type TestOutputEvent,
  type TestProvider,
  type TestRunResult,
  type TestStopResult,
} from "../../shared/tests";
import { getDeveloperToolSpawnEnvironment } from "../process/environment";

interface TestManagerDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

const TEST_DISCOVERY_IGNORE = new Set([
  ".git",
  ".cache",
  ".gocache",
  ".go-cache",
  ".gradle",
  ".mypy_cache",
  ".next",
  ".nyc_output",
  ".parcel-cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".turbo",
  ".vite",
  ".venv",
  "__generated__",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "gen",
  "generated",
  "go-build",
  "gocache",
  "node_modules",
  "out",
  "target",
  "vendor",
  "venv",
]);
const MAX_TEST_ITEMS = 250;
const MAX_PROJECT_ROOT_SCAN_DEPTH = 6;

interface PackageJson {
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

export class TestManager {
  private readonly activeRuns = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly runStartedAt = new Map<string, number>();
  private readonly deps: TestManagerDependencies;

  constructor(deps: TestManagerDependencies) {
    this.deps = deps;
  }

  discover(folderPath: string): TestDiscoveryResult {
    const providers: TestProvider[] = [];
    const items: TestItem[] = [];

    for (const projectRoot of this.discoverProjectRoots(folderPath)) {
      const rootLabel = this.formatProjectRootLabel(folderPath, projectRoot);
      const packageJson = this.readPackageJson(projectRoot);

      for (const [scriptName, command] of Object.entries(
        packageJson?.scripts ?? {},
      )) {
        if (!/\b(test|vitest|jest)\b/i.test(`${scriptName} ${command}`)) {
          continue;
        }

        const providerId = this.providerId("npm", projectRoot, folderPath, scriptName);
        providers.push({
          id: providerId,
          kind: "npm",
          label:
            rootLabel === "."
              ? `npm run ${scriptName}`
              : `${rootLabel}: npm run ${scriptName}`,
          detail: command,
          rootPath: projectRoot,
          scriptName,
        });
        items.push({
          id: providerId,
          providerId,
          label: scriptName,
          detail: command,
          path: null,
          kind: "script",
        });
      }

      if (fs.existsSync(path.join(projectRoot, "go.mod"))) {
        const providerId = this.providerId("go", projectRoot, folderPath, "test");
        providers.push({
          id: providerId,
          kind: "go",
          label: rootLabel === "." ? "go test ./..." : `${rootLabel}: go test ./...`,
          detail: "Run Go tests for the module",
          rootPath: projectRoot,
        });
        items.push(...this.discoverGoTestPackages(folderPath, projectRoot, providerId));
      }

      if (
        fs.existsSync(path.join(projectRoot, "pytest.ini")) ||
        fs.existsSync(path.join(projectRoot, "pyproject.toml")) ||
        fs.existsSync(path.join(projectRoot, "requirements.txt"))
      ) {
        const providerId = this.providerId("pytest", projectRoot, folderPath, "test");
        providers.push({
          id: providerId,
          kind: "pytest",
          label: rootLabel === "." ? "pytest" : `${rootLabel}: pytest`,
          detail: "Run Python tests with pytest",
          rootPath: projectRoot,
        });
        items.push(
          ...this.discoverTestFiles(
            projectRoot,
            providerId,
            /\.py$/i,
            (filePath) => /(^|[\\/])test_.*\.py$/i.test(filePath) || /_test\.py$/i.test(filePath),
          ).map((item) => ({
            ...item,
            label: this.formatNestedItemLabel(folderPath, item.path, item.label),
          })),
        );
      }

      if (fs.existsSync(path.join(projectRoot, "Cargo.toml"))) {
        const providerId = this.providerId("cargo", projectRoot, folderPath, "test");
        providers.push({
          id: providerId,
          kind: "cargo",
          label: rootLabel === "." ? "cargo test" : `${rootLabel}: cargo test`,
          detail: "Run Rust tests",
          rootPath: projectRoot,
        });
        items.push(
          ...this.discoverTestFiles(
            projectRoot,
            providerId,
            /\.rs$/i,
            (filePath) =>
              filePath.includes(`${path.sep}tests${path.sep}`) ||
              filePath.endsWith(`${path.sep}lib.rs`) ||
              filePath.endsWith(`${path.sep}main.rs`),
          ).map((item) => ({
            ...item,
            label: this.formatNestedItemLabel(folderPath, item.path, item.label),
          })),
        );
      }
    }

    return {
      ok: true,
      message:
        providers.length === 0
          ? "No test providers found."
          : `Found ${providers.length} test provider${providers.length === 1 ? "" : "s"}.`,
      providers,
      items,
    };
  }

  private readPackageJson(projectRoot: string): PackageJson | null {
    const packageJsonPath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
    } catch {
      // Invalid package metadata should not hide Go, Rust, or Python providers
      // from the same workspace. Discovery keeps moving so one broken manifest
      // does not make the whole Test Explorer look empty.
      return null;
    }
  }

  private discoverProjectRoots(folderPath: string): string[] {
    const roots = new Set<string>([folderPath]);
    const packageJson = this.readPackageJson(folderPath);
    const workspacePatterns = Array.isArray(packageJson?.workspaces)
      ? packageJson.workspaces
      : packageJson?.workspaces?.packages ?? [];

    for (const pattern of workspacePatterns) {
      for (const workspaceRoot of this.expandWorkspacePattern(folderPath, pattern)) {
        roots.add(workspaceRoot);
      }
    }

    // Test discovery follows real project markers instead of assuming a fixed
    // repository layout. A workspace can contain Go modules, npm packages,
    // Python projects, or Cargo crates under any folder name. I scan with a
    // bounded depth and skip dependency/build folders so opening a monorepo
    // root still finds nested projects without crawling the whole filesystem.
    this.collectMarkedProjectRoots(
      folderPath,
      roots,
      MAX_PROJECT_ROOT_SCAN_DEPTH,
    );

    return [...roots].sort((a, b) => a.localeCompare(b));
  }

  private expandWorkspacePattern(folderPath: string, pattern: string): string[] {
    const normalizedPattern = pattern.replace(/\\/g, "/");
    if (!normalizedPattern.endsWith("/*")) {
      const absolutePath = path.resolve(folderPath, normalizedPattern);
      return fs.existsSync(absolutePath) ? [absolutePath] : [];
    }

    const parent = path.resolve(folderPath, normalizedPattern.slice(0, -2));
    try {
      return fs
        .readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !this.shouldIgnoreDiscoveryEntry(entry.name))
        .map((entry) => path.join(parent, entry.name));
    } catch {
      return [];
    }
  }

  private collectMarkedProjectRoots(
    directory: string,
    roots: Set<string>,
    depthRemaining: number,
  ) {
    if (depthRemaining < 0) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    const markerNames = new Set(entries.map((entry) => entry.name));
    if (
      markerNames.has("package.json") ||
      markerNames.has("go.mod") ||
      markerNames.has("Cargo.toml") ||
      markerNames.has("pytest.ini") ||
      markerNames.has("pyproject.toml") ||
      markerNames.has("requirements.txt")
    ) {
      roots.add(directory);
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || this.shouldIgnoreDiscoveryEntry(entry.name)) continue;
      this.collectMarkedProjectRoots(path.join(directory, entry.name), roots, depthRemaining - 1);
    }
  }

  private shouldIgnoreDiscoveryEntry(name: string) {
    const lowerName = name.toLowerCase();
    if (TEST_DISCOVERY_IGNORE.has(lowerName)) return true;

    // Test discovery is intentionally project-aware, not artifact-aware. Go,
    // Python, Node, Rust, and build tools can create nested cache directories
    // whose names vary by platform or environment. Treating those cache and
    // generated-folder names as dead zones keeps the Test Explorer focused on
    // source-owned tests and prevents huge generated trees from making the UI
    // slow or showing meaningless providers.
    return (
      lowerName.includes("gocache") ||
      lowerName.startsWith("go-build") ||
      lowerName.endsWith(".cache") ||
      lowerName === "generated" ||
      lowerName === "__generated__"
    );
  }

  private providerId(
    kind: TestProvider["kind"],
    projectRoot: string,
    folderPath: string,
    suffix: string,
  ) {
    const relativeRoot = path.relative(folderPath, projectRoot).replace(/\\/g, "/") || ".";
    return `${kind}:${relativeRoot}:${suffix}`;
  }

  private formatProjectRootLabel(folderPath: string, projectRoot: string) {
    return path.relative(folderPath, projectRoot).replace(/\\/g, "/") || ".";
  }

  private formatNestedItemLabel(
    folderPath: string,
    itemPath: string | null,
    fallbackLabel: string,
  ) {
    if (!itemPath) return fallbackLabel;
    return path.relative(folderPath, itemPath).replace(/\\/g, "/");
  }

  private discoverTestFiles(
    folderPath: string,
    providerId: string,
    extensionPattern: RegExp,
    predicate: (filePath: string) => boolean,
  ): TestItem[] {
    const items: TestItem[] = [];
    const visit = (directory: string) => {
      if (items.length >= MAX_TEST_ITEMS) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (items.length >= MAX_TEST_ITEMS) return;
        if (this.shouldIgnoreDiscoveryEntry(entry.name)) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(absolutePath);
          continue;
        }
        if (
          entry.isFile() &&
          extensionPattern.test(entry.name) &&
          predicate(absolutePath)
        ) {
          const relativePath = path.relative(folderPath, absolutePath);
          items.push({
            id: `${providerId}:${relativePath}`,
            providerId,
            label: relativePath.replace(/\\/g, "/"),
            detail: absolutePath,
            path: absolutePath,
            kind: "file",
          });
        }
      }
    };

    visit(folderPath);
    return items;
  }

  private discoverGoTestPackages(
    workspaceRoot: string,
    projectRoot: string,
    providerId: string,
  ): TestItem[] {
    const packageDirectories = new Set<string>();
    const visit = (directory: string) => {
      if (packageDirectories.size >= MAX_TEST_ITEMS) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (packageDirectories.size >= MAX_TEST_ITEMS) return;
        if (this.shouldIgnoreDiscoveryEntry(entry.name)) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(absolutePath);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith("_test.go")) {
          packageDirectories.add(directory);
        }
      }
    };

    visit(projectRoot);

    return [...packageDirectories]
      .sort((a, b) => a.localeCompare(b))
      .map((packageDirectory) => {
        const packagePath =
          path.relative(projectRoot, packageDirectory).replace(/\\/g, "/") || ".";
        const workspaceLabel = path
          .relative(workspaceRoot, packageDirectory)
          .replace(/\\/g, "/");
        const commandPath = this.formatRelativeCommandPath(packagePath);

        return {
          id: `${providerId}:${packagePath}`,
          providerId,
          label: workspaceLabel || ".",
          detail: `go test ${commandPath}`,
          path: packageDirectory,
          kind: "package" as const,
        };
      });
  }

  private getProviderCommand(provider: TestProvider, target?: TestItem | null) {
    if (provider.kind === "npm") {
      return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", provider.scriptName ?? "test"],
      };
    }
    if (provider.kind === "go") {
      const packagePath = target?.path
        ? this.formatRelativeCommandPath(
            path.relative(provider.rootPath, target.path).replace(/\\/g, "/") || ".",
          )
        : "./...";
      return { command: "go", args: ["test", packagePath] };
    }
    if (provider.kind === "pytest") {
      return {
        command: "pytest",
        args: target?.path ? [target.path] : [],
      };
    }
    return {
      command: "cargo",
      args: target?.path ? ["test", "--test", path.basename(target.path, ".rs")] : ["test"],
    };
  }

  private formatRelativeCommandPath(relativePath: string) {
    return relativePath === "." ? "." : `./${relativePath}`;
  }

  private sendOutput(event: TestOutputEvent) {
    this.deps.sendToRenderer("tests:output", event);
  }

  private sendFinished(event: TestFinishedEvent) {
    this.deps.sendToRenderer("tests:finished", event);
  }

  async run(
    folderPath: string,
    providerId: string,
    targetId?: string | null,
  ): Promise<TestRunResult> {
    const discovery = this.discover(folderPath);
    const provider = discovery.providers.find(
      (candidate) => candidate.id === providerId,
    );
    if (!provider) {
      return {
        ok: false,
        message: "Test provider is no longer available.",
        runId: null,
        provider: null,
        targetId: targetId ?? null,
      };
    }

    const target = targetId
      ? discovery.items.find((item) => item.id === targetId)
      : null;
    if (targetId && !target) {
      return {
        ok: false,
        message: "Test target is no longer available.",
        runId: null,
        provider,
        targetId,
      };
    }

    const runId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const { command, args } = this.getProviderCommand(provider, target);
    const env = await getDeveloperToolSpawnEnvironment();
    const child = spawn(command, args, {
      cwd: provider.rootPath,
      env,
    });
    this.activeRuns.set(runId, child);
    this.runStartedAt.set(runId, Date.now());

    this.sendOutput({
      runId,
      providerId: provider.id,
      label: target?.label ?? provider.label,
      rootPath: provider.rootPath,
      stream: "system",
      line: provider.rootPath,
    });
    this.sendOutput({
      runId,
      providerId: provider.id,
      label: target?.label ?? provider.label,
      rootPath: provider.rootPath,
      stream: "system",
      line: `$ ${[command, ...args].join(" ")}`,
    });

    const stream = (name: "stdout" | "stderr", chunk: Buffer) => {
      for (const line of chunk.toString("utf-8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.sendOutput({
          runId,
          providerId: provider.id,
          label: target?.label ?? provider.label,
          rootPath: provider.rootPath,
          stream: name,
          line,
        });
      }
    };

    child.stdout.on("data", (chunk: Buffer) => stream("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => stream("stderr", chunk));
    let hasFinished = false;
    const finish = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (hasFinished) return;
      hasFinished = true;
      this.activeRuns.delete(runId);
      const startedAt = this.runStartedAt.get(runId) ?? Date.now();
      this.runStartedAt.delete(runId);
      this.sendFinished({
        runId,
        providerId: provider.id,
        label: target?.label ?? provider.label,
        rootPath: provider.rootPath,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        status: signal ? "stopped" : exitCode === 0 ? "passed" : "failed",
      });
    };

    // A failed spawn emits `error` instead of throwing from spawn(). Without an
    // error listener Node treats ENOENT as an uncaught exception and terminates
    // Electron's main process. Reporting it through the test panel keeps Axon
    // alive and gives the user the actual missing command and recovered PATH.
    child.on("error", (err) => {
      this.sendOutput({
        runId,
        providerId: provider.id,
        label: target?.label ?? provider.label,
        rootPath: provider.rootPath,
        stream: "stderr",
        line: `Could not start ${command}: ${err.message}`,
      });
      finish(null, null);
    });
    child.on("close", finish);

    return {
      ok: true,
      message: `Started ${target?.label ?? provider.label}.`,
      runId,
      provider,
      label: target?.label ?? provider.label,
      targetId: target?.id ?? null,
    };
  }

  stopAll(): TestStopResult {
    let stopped = 0;
    for (const child of this.activeRuns.values()) {
      if (!child.killed) child.kill();
      stopped += 1;
    }
    this.activeRuns.clear();
    this.runStartedAt.clear();
    return {
      ok: true,
      message:
        stopped === 0
          ? "No test runs are active."
          : `Stopped ${stopped} active test run${stopped === 1 ? "" : "s"}.`,
      stopped,
    };
  }
}
