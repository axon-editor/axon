import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { type TaskFinishedEvent, type TaskOutputEvent, type TaskRunResult, type WorkspaceTask } from "../../shared/tasks";

interface TaskManagerDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

export class TaskManager {
  private readonly activeTasks = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(private readonly deps: TaskManagerDependencies) {}

  getWorkspaceTasks(folderPath: string): WorkspaceTask[] {
    const tasks: WorkspaceTask[] = [];

    if (fs.existsSync(path.join(folderPath, "package.json"))) {
      try {
        const packageJsonPath = path.join(folderPath, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
          scripts?: Record<string, string>;
        };

        if (packageJson.scripts) {
          for (const [name] of Object.entries(packageJson.scripts)) {
            tasks.push({
              id: `npm:${name}`,
              kind: "npm",
              label: `npm run ${name}`,
              detail: `Run the ${name} npm script`,
            });
          }
        }
      } catch {
        // Invalid package.json should not break the task list. Axon keeps the
        // workspace usable and simply omits npm tasks until the file is valid.
      }
    }

    if (fs.existsSync(path.join(folderPath, "go.mod"))) {
      tasks.push(
        {
          id: "go:test",
          kind: "go",
          label: "go test",
          detail: "Run Go tests",
        },
        {
          id: "go:build",
          kind: "go",
          label: "go build",
          detail: "Build the Go module",
        },
      );
    }

    if (fs.existsSync(path.join(folderPath, "Cargo.toml"))) {
      tasks.push(
        {
          id: "cargo:test",
          kind: "cargo",
          label: "cargo test",
          detail: "Run Cargo tests",
        },
        {
          id: "cargo:build",
          kind: "cargo",
          label: "cargo build",
          detail: "Build the Cargo package",
        },
      );
    }

    return tasks;
  }

  private getTaskCommand(task: WorkspaceTask) {
    if (task.kind === "npm") {
      const scriptName = task.id.slice("npm:".length);
      return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", scriptName],
      };
    }

    if (task.id === "go:test") return { command: "go", args: ["test", "./..."] };
    if (task.id === "go:build") {
      return { command: "go", args: ["build", "./..."] };
    }
    if (task.id === "cargo:test") return { command: "cargo", args: ["test"] };
    return { command: "cargo", args: ["build"] };
  }

  private sendTaskOutput(event: TaskOutputEvent) {
    this.deps.sendToRenderer("task:output", event);
  }

  private sendTaskFinished(event: TaskFinishedEvent) {
    this.deps.sendToRenderer("task:finished", event);
  }

  private streamTaskOutput(
    runId: string,
    task: WorkspaceTask,
    stream: "stdout" | "stderr",
    chunk: Buffer,
    buffer: { value: string },
  ) {
    buffer.value += chunk.toString();
    const lines = buffer.value.split(/\r?\n/);
    buffer.value = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      this.sendTaskOutput({
        runId,
        taskId: task.id,
        label: task.label,
        stream,
        line,
      });
    }
  }

  startWorkspaceTask(folderPath: string, taskId: string): TaskRunResult {
    // The renderer sends only a task id. I re-detect the task right before
    // execution so stale UI state cannot run a command that no longer belongs to
    // the current workspace after package.json or the folder changes.
    const task = this.getWorkspaceTasks(folderPath).find(
      (candidate) => candidate.id === taskId,
    );
    if (!task) {
      throw new Error("Task is no longer available in this workspace.");
    }

    const runId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const { command, args } = this.getTaskCommand(task);
    // spawn gives us streaming stdout/stderr, which is the important behavior for
    // build tools. execFile would only return after the command ends, making the
    // Output panel feel frozen during long tests or builds.
    const child = spawn(command, args, {
      cwd: folderPath,
      env: process.env,
    });
    const stdoutBuffer = { value: "" };
    const stderrBuffer = { value: "" };

    this.activeTasks.set(runId, child);
    this.sendTaskOutput({
      runId,
      taskId: task.id,
      label: task.label,
      stream: "system",
      line: `$ ${[command, ...args].join(" ")}`,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      this.streamTaskOutput(runId, task, "stdout", chunk, stdoutBuffer);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.streamTaskOutput(runId, task, "stderr", chunk, stderrBuffer);
    });
    child.on("error", (err) => {
      this.sendTaskOutput({
        runId,
        taskId: task.id,
        label: task.label,
        stream: "stderr",
        line: err.message,
      });
    });
    child.on("close", (exitCode, signal) => {
      if (stdoutBuffer.value.trim()) {
        this.sendTaskOutput({
          runId,
          taskId: task.id,
          label: task.label,
          stream: "stdout",
          line: stdoutBuffer.value.trimEnd(),
        });
      }
      if (stderrBuffer.value.trim()) {
        this.sendTaskOutput({
          runId,
          taskId: task.id,
          label: task.label,
          stream: "stderr",
          line: stderrBuffer.value.trimEnd(),
        });
      }
      this.activeTasks.delete(runId);
      this.sendTaskFinished({
        runId,
        taskId: task.id,
        label: task.label,
        exitCode,
        signal,
      });
    });

    return { runId, task };
  }

  stopAll() {
    // Tasks are child processes owned by Axon. If the app quits while a build is
    // still running, leaving those processes alive would make the Output panel
    // lie on the next launch and could keep project tools running in the
    // background without a visible owner.
    for (const taskProcess of this.activeTasks.values()) {
      if (!taskProcess.killed) taskProcess.kill();
    }
    this.activeTasks.clear();
  }
}
