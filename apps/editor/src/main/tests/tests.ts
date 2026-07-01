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
} from "../../shared/tests";

interface TestManagerDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

const TEST_DISCOVERY_IGNORE = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  ".vite",
  "__pycache__",
]);
const MAX_TEST_ITEMS = 250;

export class TestManager {
  private readonly activeRuns = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly deps: TestManagerDependencies;

  constructor(deps: TestManagerDependencies) {
    this.deps = deps;
  }

  discover(folderPath: string): TestDiscoveryResult {
    const providers: TestProvider[] = [];
    const items: TestItem[] = [];

    if (fs.existsSync(path.join(folderPath, "package.json"))) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(folderPath, "package.json"), "utf-8"),
        ) as { scripts?: Record<string, string> };
        for (const [scriptName, command] of Object.entries(
          packageJson.scripts ?? {},
        )) {
          if (!/\b(test|vitest|jest)\b/i.test(`${scriptName} ${command}`)) {
            continue;
          }
          providers.push({
            id: `npm:${scriptName}`,
            kind: "npm",
            label: `npm run ${scriptName}`,
            detail: command,
          });
          items.push({
            id: `npm:${scriptName}`,
            providerId: `npm:${scriptName}`,
            label: scriptName,
            detail: command,
            path: null,
            kind: "script",
          });
        }
      } catch {
        // Invalid package.json should not block other test providers.
      }
    }

    if (fs.existsSync(path.join(folderPath, "go.mod"))) {
      providers.push({
        id: "go:test",
        kind: "go",
        label: "go test ./...",
        detail: "Run Go tests for the module",
      });
      items.push(...this.discoverTestFiles(folderPath, "go:test", /\.go$/i, (filePath) =>
        filePath.endsWith("_test.go"),
      ).map((item) => ({
        ...item,
        kind: "package" as const,
        detail: `go test ./${path.relative(folderPath, path.dirname(item.path ?? folderPath)).replace(/\\/g, "/") || "."}`,
      })));
    }

    if (
      fs.existsSync(path.join(folderPath, "pytest.ini")) ||
      fs.existsSync(path.join(folderPath, "pyproject.toml")) ||
      fs.existsSync(path.join(folderPath, "requirements.txt"))
    ) {
      providers.push({
        id: "pytest",
        kind: "pytest",
        label: "pytest",
        detail: "Run Python tests with pytest",
      });
      items.push(
        ...this.discoverTestFiles(
          folderPath,
          "pytest",
          /\.py$/i,
          (filePath) => /(^|[\\/])test_.*\.py$/i.test(filePath) || /_test\.py$/i.test(filePath),
        ),
      );
    }

    if (fs.existsSync(path.join(folderPath, "Cargo.toml"))) {
      providers.push({
        id: "cargo:test",
        kind: "cargo",
        label: "cargo test",
        detail: "Run Rust tests",
      });
      items.push(
        ...this.discoverTestFiles(
          folderPath,
          "cargo:test",
          /\.rs$/i,
          (filePath) =>
            filePath.includes(`${path.sep}tests${path.sep}`) ||
            filePath.endsWith(`${path.sep}lib.rs`) ||
            filePath.endsWith(`${path.sep}main.rs`),
        ),
      );
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
        if (TEST_DISCOVERY_IGNORE.has(entry.name)) continue;
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

  private getProviderCommand(provider: TestProvider, target?: TestItem | null) {
    if (provider.kind === "npm") {
      return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", provider.id.slice("npm:".length)],
      };
    }
    if (provider.kind === "go") {
      const packagePath = target?.path
        ? `./${path.dirname(target.label).replace(/\\/g, "/") || "."}`
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

  private sendOutput(event: TestOutputEvent) {
    this.deps.sendToRenderer("tests:output", event);
  }

  private sendFinished(event: TestFinishedEvent) {
    this.deps.sendToRenderer("tests:finished", event);
  }

  run(folderPath: string, providerId: string, targetId?: string | null): TestRunResult {
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
    const child = spawn(command, args, {
      cwd: folderPath,
      env: process.env,
    });
    this.activeRuns.set(runId, child);

    this.sendOutput({
      runId,
      providerId: provider.id,
      label: target?.label ?? provider.label,
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
          stream: name,
          line,
        });
      }
    };

    child.stdout.on("data", (chunk: Buffer) => stream("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => stream("stderr", chunk));
    child.on("close", (exitCode, signal) => {
      this.activeRuns.delete(runId);
      this.sendFinished({
        runId,
        providerId: provider.id,
        label: target?.label ?? provider.label,
        exitCode,
        signal,
      });
    });

    return {
      ok: true,
      message: `Started ${target?.label ?? provider.label}.`,
      runId,
      provider,
      targetId: target?.id ?? null,
    };
  }

  stopAll() {
    for (const child of this.activeRuns.values()) {
      if (!child.killed) child.kill();
    }
    this.activeRuns.clear();
  }
}
