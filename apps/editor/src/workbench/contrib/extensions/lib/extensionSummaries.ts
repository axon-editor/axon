/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExtensionInfo } from "../../../../shared/extensions";

export interface ExtensionSummary {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  source: ExtensionInfo["source"];
  repositoryUrl: string | null;
  homepageUrl: string | null;
  kind: ExtensionInfo["kind"];
  enabled: boolean;
  builtin: boolean;
  lifecycle: ExtensionInfo["lifecycle"];
  contributionCount: number;
  themeLabels: string[];
  errors: string[];
  hasWebview: boolean;
  keywords: string[];
}

function getContributionCount(extension: ExtensionInfo) {
  return (
    extension.contributes.themes.length +
    extension.contributes.commands.length +
    extension.contributes.languages.length +
    extension.contributes.snippets.length +
    extension.contributes.icons.length +
    extension.contributes.iconThemes.length +
    extension.contributes.views.length +
    extension.contributes.agents.length +
    extension.contributes.terminalProfiles.length +
    extension.contributes.taskProviders.length +
    extension.contributes.debuggerProviders.length +
    extension.contributes.languagePacks.length
  );
}

export function summarizeExtension(extension: ExtensionInfo): ExtensionSummary {
  return {
    id: extension.id,
    name: extension.name,
    publisher: extension.publisher,
    version: extension.version,
    description: extension.description,
    source: extension.source,
    repositoryUrl: extension.repositoryUrl,
    homepageUrl: extension.homepageUrl,
    kind: extension.kind,
    enabled: extension.enabled,
    builtin: extension.builtin,
    lifecycle: extension.lifecycle,
    contributionCount: getContributionCount(extension),
    themeLabels: extension.themes.map((theme) => theme.label),
    errors: extension.errors,
    hasWebview: extension.hasWebview,
    keywords: [...(extension.categories ?? [])],
  };
}