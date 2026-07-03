import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestOutputEvent,
  type TestRunResult,
  type TestStopResult,
} from "@axon-editor/shared/tests";

export interface TestingWorkbenchApi {
  discover(folderPath: string): Promise<TestDiscoveryResult>;
  run(
    folderPath: string,
    providerId: string,
    targetId?: string | null,
  ): Promise<TestRunResult>;
  stopAll(): Promise<TestStopResult>;
  onOutput(callback: (event: TestOutputEvent) => void): () => void;
  onFinished(callback: (event: TestFinishedEvent) => void): () => void;
}

export function createTestingWorkbenchApi(): TestingWorkbenchApi {
  return {
    discover: (folderPath) => window.axon.discoverTests(folderPath),
    run: (folderPath, providerId, targetId) =>
      window.axon.runTests(folderPath, providerId, targetId),
    stopAll: () => window.axon.stopTests(),
    onOutput: (callback) => window.axon.onTestOutput(callback),
    onFinished: (callback) => window.axon.onTestFinished(callback),
  };
}
