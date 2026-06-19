import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestOutputEvent,
  type TestProvider,
  type TestRunResult,
} from "../../shared/tests";

interface TestManagerDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

export class TestManager {
  private readonly activeRuns = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly deps: TestManagerDependencies;

  constructor(deps: TestManagerDependencies) {
    this.deps = deps;
  }

  discover(folderPath: string): TestDiscoveryResult {
    const providers: TestProvider[] = [];

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
    }

    if (fs.existsSync(path.join(folderPath, "Cargo.toml"))) {
      providers.push({
        id: "cargo:test",
        kind: "cargo",
        label: "cargo test",
        detail: "Run Rust tests",
      });
    }

    return {
      ok: true,
      message:
        providers.length === 0
          ? "No test providers found."
          : `Found ${providers.length} test provider${providers.length === 1 ? "" : "s"}.`,
      providers,
    };
  }

  private getProviderCommand(provider: TestProvider) {
    if (provider.kind === "npm") {
      return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", provider.id.slice("npm:".length)],
      };
    }
    if (provider.kind === "go") return { command: "go", args: ["test", "./..."] };
    if (provider.kind === "pytest") return { command: "pytest", args: [] };
    return { command: "cargo", args: ["test"] };
  }

  private sendOutput(event: TestOutputEvent) {
    this.deps.sendToRenderer("tests:output", event);
  }

  private sendFinished(event: TestFinishedEvent) {
    this.deps.sendToRenderer("tests:finished", event);
  }

  run(folderPath: string, providerId: string): TestRunResult {
    const provider = this.discover(folderPath).providers.find(
      (candidate) => candidate.id === providerId,
    );
    if (!provider) {
      return {
        ok: false,
        message: "Test provider is no longer available.",
        runId: null,
        provider: null,
      };
    }

    const runId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const { command, args } = this.getProviderCommand(provider);
    const child = spawn(command, args, {
      cwd: folderPath,
      env: process.env,
    });
    this.activeRuns.set(runId, child);

    this.sendOutput({
      runId,
      providerId: provider.id,
      label: provider.label,
      stream: "system",
      line: `$ ${[command, ...args].join(" ")}`,
    });

    const stream = (name: "stdout" | "stderr", chunk: Buffer) => {
      for (const line of chunk.toString("utf-8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.sendOutput({
          runId,
          providerId: provider.id,
          label: provider.label,
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
        label: provider.label,
        exitCode,
        signal,
      });
    });

    return {
      ok: true,
      message: `Started ${provider.label}.`,
      runId,
      provider,
    };
  }

  stopAll() {
    for (const child of this.activeRuns.values()) {
      if (!child.killed) child.kill();
    }
    this.activeRuns.clear();
  }
}
