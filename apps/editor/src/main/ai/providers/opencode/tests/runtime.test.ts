/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type AiRuntimeStatus } from "../../../../../shared/ai/ai";
import { mergeRuntimeStatus } from "../models/runtime";

const coreStatus: AiRuntimeStatus = {
  installed: true,
  running: true,
  startedByAxon: true,
  providerLabel: "Axon models",
  selectedModel: "axon-code",
  selectedModelInstalled: true,
  models: [
    {
      id: "axon-code",
      label: "Axon Code",
      providerLabel: "Axon models",
      available: true,
    },
  ],
  memoryGB: 32,
  detail: "Axon models ready",
  installHint: "",
};

describe("mergeRuntimeStatus", () => {
  it("adds OpenCode models and reports OpenCode as the selected provider", () => {
    const merged = mergeRuntimeStatus(
      coreStatus,
      {
        installed: true,
        running: true,
        models: [
          {
            id: "opencode/big-pickle",
            label: "Big Pickle",
            providerLabel: "OpenCode",
            available: true,
            backend: "opencode",
            providerID: "opencode",
            modelID: "big-pickle",
          },
        ],
        detail: "OpenCode 2.2.5",
        installHint: "",
      },
      "opencode/big-pickle",
    );

    expect(merged.models.map((model) => model.id)).toEqual([
      "axon-code",
      "opencode/big-pickle",
    ]);
    expect(merged.selectedModelInstalled).toBe(true);
    expect(merged.providerLabel).toBe("OpenCode");
    expect(merged.detail).toContain("OpenCode 2.2.5");
  });

  it("keeps local status when OpenCode is absent", () => {
    const merged = mergeRuntimeStatus(coreStatus, null, "axon-code");

    expect(merged.providerLabel).toBe("Axon models");
    expect(merged.models).toHaveLength(1);
    expect(merged.detail).toBe("Axon models ready");
  });
});
