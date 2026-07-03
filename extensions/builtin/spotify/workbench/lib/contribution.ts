import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

export const AXON_SPOTIFY_EXTENSION_ID = "axon.spotify";
export const AXON_SPOTIFY_VIEW_ID = "axon.spotify";

export interface SpotifyWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
}

export function resolveSpotifyWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): SpotifyWorkbenchContribution | null {
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.spotify,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_SPOTIFY_EXTENSION_ID,
    viewId: AXON_SPOTIFY_VIEW_ID,
    viewTitle: resolved.views[AXON_SPOTIFY_VIEW_ID]?.title ?? "Spotify",
  };
}
