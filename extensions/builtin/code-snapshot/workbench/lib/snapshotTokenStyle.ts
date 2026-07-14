import type { ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions";
import {
  createDefaultCaptureEntries,
  findCapturesForMonacoToken,
  resolveCaptureStyleForInspector,
} from "@axon-editor/renderer/shared/themes/captureRegistry";
import { createExtensionSyntaxThemeEntries } from "@axon-editor/renderer/shared/themes/syntaxTheme";
import type { ThemeTokenMap } from "@axon-editor/renderer/shared/themes/types";

export interface SnapshotTokenStyle {
  color: string;
  fontStyle: string;
  fontWeight: string;
}

export function createSnapshotTokenStyleResolver(
  themeTokens: ThemeTokenMap,
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>,
) {
  const entries = [
    ...createDefaultCaptureEntries(themeTokens),
    ...createExtensionSyntaxThemeEntries(themeSyntax),
  ];

  // I resolve snapshot colors through Monaco's capture table instead of
  // treating tokenizer names as CSS classes. Values such as `string.key.json`
  // and `identifier.function.ts` are semantic names, so looking for matching
  // DOM classes previously collapsed most exports to the plain foreground.
  // I build these entries once per render to avoid rebuilding the same active
  // theme table whenever a snapshot contains several token classes.
  return (monacoToken: string): SnapshotTokenStyle => {
    const capture =
      findCapturesForMonacoToken(monacoToken)[0]?.capture ?? "primary";
    const style = resolveCaptureStyleForInspector(capture, entries);
    const fontStyles = new Set(style?.fontStyle?.split(/\s+/).filter(Boolean));

    return {
      color: style?.color ?? themeTokens["editor.foreground"],
      fontStyle: fontStyles.has("italic") ? "italic" : "normal",
      fontWeight: fontStyles.has("bold") ? "700" : "400",
    };
  };
}
