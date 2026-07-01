import { publicAsset } from "../../../../shared/lib/assets";

const CATPPUCCIN_ICON_PUBLIC_BASE =
  "extensions/builtin/icons/catppuccin/assets/";

export function getCatppuccinIconAsset(filename: string) {
  // The Catppuccin icon extension is the source package, but Vite serves static
  // SVGs from public during development and packaged renderer builds. Keeping
  // this boundary in one helper means the file tree can later switch to a real
  // extension asset protocol without every sidebar/search call site changing.
  return `${publicAsset(CATPPUCCIN_ICON_PUBLIC_BASE)}${filename}`;
}
