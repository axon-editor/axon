import {
  markAxonPerformance,
  measureAxonPerformance,
} from "../../../renderer/shared/lib/performanceMarks";

export type WorkspaceOpenSource = "picker" | "root" | "session" | "cli" | "recent";

export interface WorkspaceServiceGeneration {
  id: number;
  path: string;
  source: WorkspaceOpenSource;
  restored: boolean;
}

export interface WorkspaceServiceCoordinator {
  begin: (input: {
    path: string;
    source: WorkspaceOpenSource;
    restored?: boolean;
  }) => WorkspaceServiceGeneration;
  isCurrent: (generation: WorkspaceServiceGeneration) => boolean;
  markVisible: (generation: WorkspaceServiceGeneration) => void;
  runPhase: <T>(
    generation: WorkspaceServiceGeneration,
    phase: string,
    run: () => Promise<T>,
    handlers?: {
      onSuccess?: (value: T) => void;
      onError?: (err: unknown) => void;
    },
  ) => Promise<void>;
}

export function createWorkspaceServiceCoordinator(): WorkspaceServiceCoordinator {
  let currentGenerationId = 0;

  const isCurrent = (generation: WorkspaceServiceGeneration) =>
    generation.id === currentGenerationId;

  return {
    begin(input) {
      currentGenerationId += 1;
      const generation = {
        id: currentGenerationId,
        path: input.path,
        source: input.source,
        restored: input.restored === true,
      };
      markAxonPerformance("axon.workspace.coordinator.start", {
        generationId: generation.id,
        source: generation.source,
        restored: generation.restored,
      });
      return generation;
    },

    isCurrent,

    markVisible(generation) {
      if (!isCurrent(generation)) return;
      markAxonPerformance("axon.workspace.coordinator.visible", {
        generationId: generation.id,
        source: generation.source,
      });
      measureAxonPerformance(
        "axon.workspace.visible",
        "axon.workspace.coordinator.start",
        "axon.workspace.coordinator.visible",
      );
    },

    async runPhase(generation, phase, run, handlers) {
      if (!isCurrent(generation)) return;
      const startMark = `axon.workspace.service.${phase}.start`;
      const endMark = `axon.workspace.service.${phase}.end`;
      markAxonPerformance(startMark, {
        generationId: generation.id,
        source: generation.source,
      });

      try {
        const result = await run();
        if (!isCurrent(generation)) return;
        handlers?.onSuccess?.(result);
      } catch (err) {
        if (!isCurrent(generation)) return;
        handlers?.onError?.(err);
      } finally {
        // A return inside finally overrides returns and thrown errors from the
        // service phase. The generation check therefore guards only the timing
        // side effect; stale work remains ignored without changing control flow.
        if (isCurrent(generation)) {
          markAxonPerformance(endMark, {
            generationId: generation.id,
            source: generation.source,
            phase,
          });
          measureAxonPerformance(
            `axon.workspace.service.${phase}`,
            startMark,
            endMark,
          );
        }
      }
    },
  };
}
