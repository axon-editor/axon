export type TestProviderKind = "npm" | "go" | "pytest" | "cargo";

export interface TestProvider {
  id: string;
  kind: TestProviderKind;
  label: string;
  detail: string;
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
  targetId?: string | null;
}

export interface TestOutputEvent {
  runId: string;
  providerId: string;
  label: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

export interface TestFinishedEvent {
  runId: string;
  providerId: string;
  label: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}
