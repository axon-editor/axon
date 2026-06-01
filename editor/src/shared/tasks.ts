export type WorkspaceTaskKind = "npm" | "go" | "cargo";

export interface WorkspaceTask {
  id: string;
  kind: WorkspaceTaskKind;
  label: string;
  detail: string;
}

export interface TaskRunResult {
  runId: string;
  task: WorkspaceTask;
}

export interface TaskOutputEvent {
  runId: string;
  taskId: string;
  label: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

export interface TaskFinishedEvent {
  runId: string;
  taskId: string;
  label: string;
  exitCode: number | null;
  signal: string | null;
}
