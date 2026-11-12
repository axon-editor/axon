/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiModelInfo } from "@axon-editor/shared/ai/ai";

// One heading per model source. Axon's own runtime is always first so the
// locally installed model stays the closest option, then OpenCode providers,
// then any future backend the runtime reports. Grouping by provider keeps a
// long OpenCode catalog from burying the Axon models it was added beside.
export interface AgentModelGroup {
  key: string;
  label: string;
  models: AiModelInfo[];
}

const axonGroupLabel = "Axon";
const axonProviderLabel = "Axon models";

function groupFor(model: AiModelInfo): { key: string; label: string; rank: number } {
  if (model.backend === "opencode") {
    const label = model.providerLabel?.trim() || "OpenCode";
    // OpenCode's own plans stay ahead of third-party providers it can proxy,
    // so the default catalog is not pushed down by alphabetical ordering.
    const providerRank =
      model.providerID === "opencode"
        ? 0
        : model.providerID === "opencode-go"
          ? 1
          : 2;
    return {
      key: `opencode:${model.providerID ?? label}`,
      label,
      rank: 10 + providerRank,
    };
  }
  if (model.providerLabel === axonProviderLabel) {
    return { key: "axon", label: axonGroupLabel, rank: 0 };
  }
  const label = model.providerLabel?.trim() || axonGroupLabel;
  return { key: `provider:${label}`, label, rank: 20 };
}

export function groupAgentModels(models: AiModelInfo[]): AgentModelGroup[] {
  const groups = new Map<
    string,
    { label: string; rank: number; models: AiModelInfo[] }
  >();

  for (const model of models) {
    const group = groupFor(model);
    const existing = groups.get(group.key);
    if (existing) {
      existing.models.push(model);
      continue;
    }
    groups.set(group.key, {
      label: group.label,
      rank: group.rank,
      models: [model],
    });
  }

  return [...groups.entries()]
    .sort(
      ([, left], [, right]) =>
        left.rank - right.rank || left.label.localeCompare(right.label),
    )
    .map(([key, group]) => ({
      key,
      label: group.label,
      models: [...group.models].sort(
        (left, right) =>
          Number(right.available) - Number(left.available) ||
          left.label.localeCompare(right.label),
      ),
    }));
}

// Row copy for both picker surfaces. Memory and download state win because they
// explain why a model is not usable yet; otherwise the provider detail carries
// the capability note. The provider name already owns the group heading, so it
// is stripped from the description instead of repeating under every row.
export function agentModelNote(model: AiModelInfo): string {
  if (model.compatibility === "unsupported") {
    return "Too much memory for this machine";
  }
  if (model.compatibility === "ok") {
    return "Runs close to this machine's memory limit";
  }
  if (!model.available) return "Needs download";
  const description = model.description?.trim() ?? "";
  const prefix = model.providerLabel ? `${model.providerLabel} · ` : "";
  return prefix && description.startsWith(prefix)
    ? description.slice(prefix.length)
    : description;
}
