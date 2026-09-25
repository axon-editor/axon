/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExtensionMarketplaceItem } from "../../../../shared/extensions";
import { formatPublisher } from "./extensionModalUtils";
import type { ExtensionSummary } from "./extensionSummaries";

// Normalized shape shared by the Installed list and the Downloads list so the
// marketplace renders one row + one detail pane for both sources.
export interface ExtensionListModel {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  kind: ExtensionSummary["kind"];
  builtin: boolean;
  hasWebview: boolean;
  installed: boolean;
  enabled: boolean | null;
  lifecycle: ExtensionSummary["lifecycle"] | null;
  sourceLabel: string;
  contributionCount: number;
  themeLabels: string[];
  contributionLabels: string[];
  errors: string[];
  keywords: string[];
  repositoryUrl: string | null;
  homepageUrl: string | null;
}

export function toInstalledListModel(
  summary: ExtensionSummary,
): ExtensionListModel {
  return {
    id: summary.id,
    name: summary.name,
    publisher: formatPublisher(summary.publisher),
    version: summary.version,
    description: summary.description,
    kind: summary.kind,
    builtin: summary.builtin,
    hasWebview: summary.hasWebview,
    installed: true,
    enabled: summary.enabled,
    lifecycle: summary.lifecycle,
    sourceLabel: summary.source,
    contributionCount: summary.contributionCount,
    themeLabels: summary.themeLabels,
    contributionLabels: [],
    errors: summary.errors,
    keywords: summary.keywords,
    repositoryUrl: summary.repositoryUrl,
    homepageUrl: summary.homepageUrl,
  };
}

export function toDownloadListModel(
  item: ExtensionMarketplaceItem,
): ExtensionListModel {
  return {
    id: item.id,
    name: item.name,
    publisher: formatPublisher(item.publisher),
    version: item.version,
    description: item.description,
    kind: item.kind,
    builtin: false,
    hasWebview: false,
    installed: item.installed,
    enabled: null,
    lifecycle: null,
    sourceLabel: item.source ?? "local",
    contributionCount: 0,
    themeLabels: [],
    contributionLabels: item.contributionLabels,
    errors: [],
    keywords: item.categories,
    repositoryUrl: item.repositoryUrl,
    homepageUrl: item.homepageUrl,
  };
}