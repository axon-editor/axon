/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  getHtmlPreviewFilePath,
  isHtmlPreviewTabPath,
} from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import {
  getMarkdownPreviewFilePath,
  isMarkdownPreviewTabPath,
} from "@axon-builtin-markdown/lib/markdownPreviewTabs";
import { isProblemsTabPath } from "@axon-builtin-problems/lib/problemsTab";
import {
  getGitCommitDiffTabData,
  isGitCommitDiffTabPath,
  isGitGraphTabPath,
} from "@axon-builtin-git/git/lib/gitGraphTab";
import { isWelcomeTabPath } from "@axon-editor/renderer/features/onboarding/lib/welcomeTab";
import {
  getCodeSnapshotSource,
  isCodeSnapshotTabPath,
} from "@axon-builtin-code-snapshot/lib/codeSnapshotTabs";
import { isSettingsTabPath } from "@axon-builtin-settings/settings/lib/settingsTab";

export function getTabFilePath(tabPath: string) {
  if (isHtmlPreviewTabPath(tabPath)) return getHtmlPreviewFilePath(tabPath);
  if (isMarkdownPreviewTabPath(tabPath))
    return getMarkdownPreviewFilePath(tabPath);
  return tabPath;
}

export function getTabDisplayName(tabPath: string) {
  if (isWelcomeTabPath(tabPath)) return "Welcome to Axon";
  if (isProblemsTabPath(tabPath)) return "Problems";
  if (isGitGraphTabPath(tabPath)) return "Git Graph";
  if (isGitCommitDiffTabPath(tabPath)) {
    const data = getGitCommitDiffTabData(tabPath);
    const fileName = data?.file.path.split(/[\\/]/).pop();
    return fileName
      ? `${fileName} (${data?.commit.shortHash ?? "Git"})`
      : "Git comparison";
  }
  if (isCodeSnapshotTabPath(tabPath)) return "Code Snapshot";
  if (isSettingsTabPath(tabPath)) return "Settings";

  const filePath = getTabFilePath(tabPath);
  const name = filePath.split("/").pop() ?? filePath;

  if (isHtmlPreviewTabPath(tabPath) || isMarkdownPreviewTabPath(tabPath)) {
    return `${name} preview`;
  }

  return name;
}

export function getTabTooltipLabel(tabPath: string) {
  if (isWelcomeTabPath(tabPath)) return "Welcome to Axon";
  if (isProblemsTabPath(tabPath)) return "Problems";
  if (isGitGraphTabPath(tabPath)) return "Repository commit graph";
  if (isGitCommitDiffTabPath(tabPath)) {
    const data = getGitCommitDiffTabData(tabPath);
    return data
      ? `${data.file.path} at ${data.commit.shortHash}`
      : "Git commit comparison";
  }
  if (isCodeSnapshotTabPath(tabPath)) {
    const source = getCodeSnapshotSource(tabPath);
    return source ? `Code snapshot: ${source.filePath}` : "Code snapshot";
  }
  if (isSettingsTabPath(tabPath)) {
    return "Workspace and application preferences";
  }

  const filePath = getTabFilePath(tabPath);
  if (isHtmlPreviewTabPath(tabPath)) return `HTML preview: ${filePath}`;
  if (isMarkdownPreviewTabPath(tabPath)) return `Markdown preview: ${filePath}`;
  return filePath;
}

export function isVirtualTabPath(tabPath: string) {
  return (
    isWelcomeTabPath(tabPath) ||
    isProblemsTabPath(tabPath) ||
    isGitGraphTabPath(tabPath) ||
    isGitCommitDiffTabPath(tabPath) ||
    isCodeSnapshotTabPath(tabPath) ||
    isSettingsTabPath(tabPath) ||
    isHtmlPreviewTabPath(tabPath) ||
    isMarkdownPreviewTabPath(tabPath)
  );
}
