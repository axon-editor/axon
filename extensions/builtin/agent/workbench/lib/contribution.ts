import {
  type ExtensionAgentContribution,
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionViewContribution,
} from "@axon-editor/shared/extensions";

export const AXON_AGENT_EXTENSION_ID = "axon.agent";
export const AXON_AGENT_VIEW_ID = "axon.agent";
export const AXON_AGENT_LOCAL_AGENT_ID = "axon.agent.local";

export interface AgentWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  agentId: string;
  agentTitle: string;
  agentDescription: string;
}

// The Agent sidebar is a built-in extension surface, so the workbench should
// mount it only after the extension registry says the Agent view and provider
// exist. That keeps this migration honest: if the manifest, activation record,
// or contribution parser regresses, Axon does not silently fall back to a
// hard-coded sidebar that hides the broken extension-host contract.
export function resolveAgentWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): AgentWorkbenchContribution | null {
  const registry = extensionState?.contributionRegistry;
  if (!registry) return null;

  const viewRecords =
    registry.views as ExtensionContributionRecord<ExtensionViewContribution>[];
  const agentRecords =
    registry.agents as ExtensionContributionRecord<ExtensionAgentContribution>[];

  const viewRecord = viewRecords.find(
    (record) =>
      record.extensionId === AXON_AGENT_EXTENSION_ID &&
      record.contribution.id === AXON_AGENT_VIEW_ID &&
      record.contribution.location === "sidebar",
  );
  const agentRecord = agentRecords.find(
    (record) =>
      record.extensionId === AXON_AGENT_EXTENSION_ID &&
      record.contribution.id === AXON_AGENT_LOCAL_AGENT_ID &&
      record.contribution.view === AXON_AGENT_VIEW_ID,
  );

  if (!viewRecord || !agentRecord) return null;

  return {
    extensionId: AXON_AGENT_EXTENSION_ID,
    viewId: viewRecord.contribution.id,
    viewTitle: viewRecord.contribution.title,
    agentId: agentRecord.contribution.id,
    agentTitle: agentRecord.contribution.title,
    agentDescription: agentRecord.contribution.description ?? "",
  };
}
