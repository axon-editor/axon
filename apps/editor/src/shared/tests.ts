export type TestProviderKind = "npm" | "go" | "pytest" | "cargo";
export type TestRunStatus = "queued" | "running" | "passed" | "failed" | "stopped";

export interface TestProvider {
  id: string;
  kind: TestProviderKind;
  label: string;
  detail: string;
  rootPath: string;
  scriptName?: string;
}

export interface TestItem {
  id: string;
  providerId: string;
  label: string;
  detail: string;
  path: string | null;
  kind: "suite" | "file" | "package" | "script";
}

export interface TestDiscoveryResult {
  ok: boolean;
  message: string;
  providers: TestProvider[];
  items: TestItem[];
}

export interface TestRunResult {
  ok: boolean;
  message: string;
  runId: string | null;
  provider: TestProvider | null;
  label?: string;
  targetId?: string | null;
}

export interface TestStopResult {
  ok: boolean;
  message: string;
  stopped: number;
}

export interface TestOutputEvent {
  runId: string;
  providerId: string;
  label: string;
  rootPath: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

export interface TestFinishedEvent {
  runId: string;
  providerId: string;
  label: string;
  rootPath: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  status: Exclude<TestRunStatus, "queued" | "running">;
}
