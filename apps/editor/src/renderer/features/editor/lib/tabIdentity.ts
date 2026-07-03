import {
  getHtmlPreviewFilePath,
  isHtmlPreviewTabPath,
} from "../../preview/lib/htmlPreviewTabs";
import {
  getMarkdownPreviewFilePath,
  isMarkdownPreviewTabPath,
} from "@axon-builtin-markdown/lib/markdownPreviewTabs";
import { isWelcomeTabPath } from "../../onboarding/lib/welcomeTab";

export function getTabFilePath(tabPath: string) {
  if (isHtmlPreviewTabPath(tabPath)) return getHtmlPreviewFilePath(tabPath);
  if (isMarkdownPreviewTabPath(tabPath)) return getMarkdownPreviewFilePath(tabPath);
  return tabPath;
}

export function getTabDisplayName(tabPath: string) {
  if (isWelcomeTabPath(tabPath)) return "Welcome to Axon";

  const filePath = getTabFilePath(tabPath);
  const name = filePath.split("/").pop() ?? filePath;

  if (isHtmlPreviewTabPath(tabPath) || isMarkdownPreviewTabPath(tabPath)) {
    return `${name} preview`;
  }

  return name;
}

export function getTabTooltipLabel(tabPath: string) {
  if (isWelcomeTabPath(tabPath)) return "Welcome to Axon";

  const filePath = getTabFilePath(tabPath);
  if (isHtmlPreviewTabPath(tabPath)) return `HTML preview: ${filePath}`;
  if (isMarkdownPreviewTabPath(tabPath)) return `Markdown preview: ${filePath}`;
  return filePath;
}

export function isVirtualTabPath(tabPath: string) {
  return (
    isWelcomeTabPath(tabPath) ||
    isHtmlPreviewTabPath(tabPath) ||
    isMarkdownPreviewTabPath(tabPath)
  );
}
