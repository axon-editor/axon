/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type AiModelInfo } from "@axon-editor/shared/ai/ai";
import { agentModelNote, groupAgentModels } from "./agentModelGroups";

function model(overrides: Partial<AiModelInfo>): AiModelInfo {
  return {
    id: "model",
    label: "Model",
    providerLabel: "Axon models",
    available: true,
    ...overrides,
  };
}

describe("groupAgentModels", () => {
  it("puts Axon first, then OpenCode providers, then other backends", () => {
    const groups = groupAgentModels([
      model({
        id: "anthropic/claude",
        label: "Claude",
        providerLabel: "Anthropic",
        backend: "opencode",
        providerID: "anthropic",
      }),
      model({ id: "axon-code", label: "Axon Code" }),
      model({
        id: "opencode/big-pickle",
        label: "Big Pickle",
        providerLabel: "OpenCode",
        backend: "opencode",
        providerID: "opencode",
      }),
      model({
        id: "opencode-go/glm",
        label: "GLM",
        providerLabel: "OpenCode Go",
        backend: "opencode",
        providerID: "opencode-go",
      }),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "Axon",
      "OpenCode",
      "OpenCode Go",
      "Anthropic",
    ]);
  });

  it("keeps each provider's models together and lists available ones first", () => {
    const groups = groupAgentModels([
      model({
        id: "opencode/zeta",
        label: "Zeta",
        providerLabel: "OpenCode",
        backend: "opencode",
        available: false,
      }),
      model({
        id: "opencode/alpha",
        label: "Alpha",
        providerLabel: "OpenCode",
        backend: "opencode",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("OpenCode");
    expect(groups[0].models.map((entry) => entry.label)).toEqual([
      "Alpha",
      "Zeta",
    ]);
  });

  it("falls back to Axon for local models without a provider label", () => {
    const groups = groupAgentModels([
      model({ id: "axon-code", label: "Axon Code", providerLabel: "" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Axon");
  });
});

describe("agentModelNote", () => {
  it("strips the provider prefix that the group heading already shows", () => {
    expect(
      agentModelNote(
        model({
          label: "Big Pickle",
          providerLabel: "OpenCode",
          description: "OpenCode · tools · account",
          backend: "opencode",
        }),
      ),
    ).toBe("tools · account");
  });

  it("prefers download state over the description", () => {
    expect(
      agentModelNote(
        model({
          available: false,
          description: "A model that is not installed yet",
        }),
      ),
    ).toBe("Needs download");
  });
});
