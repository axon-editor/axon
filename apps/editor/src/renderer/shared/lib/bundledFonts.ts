import { publicAsset } from "./assets";

const MONASPACE_NERD_WEIGHTS = [
  ["Regular", 400],
  ["Bold", 700],
] as const;

const MONASPACE_NERD_FAMILIES = [
  ["Monaspace Argon NF", "MonaspaceArgonNF"],
  ["Monaspace Krypton NF", "MonaspaceKryptonNF"],
  ["Monaspace Neon NF", "MonaspaceNeonNF"],
  ["Monaspace Radon NF", "MonaspaceRadonNF"],
  ["Monaspace Xenon NF", "MonaspaceXenonNF"],
] as const;

export const BUNDLED_MONO_FONT_FAMILIES = MONASPACE_NERD_FAMILIES.map(
  ([family]) => family,
);

export function createBundledFontFaces() {
  return MONASPACE_NERD_FAMILIES.flatMap(([family, filePrefix]) =>
    MONASPACE_NERD_WEIGHTS.map(([weightName, weight]) => {
      const url = publicAsset(
        `fonts/monaspace-nerd/${filePrefix}-${weightName}.otf`,
      );

      // Regular and bold preserve the editor and UI's real text metrics while
      // Chromium synthesizes uncommon intermediate weights. Shipping all seven
      // weights for five families added roughly 107MB to every renderer bundle,
      // even though most sessions load only one regular face.
      return `@font-face{font-family:"${family}";src:url("${url}") format("opentype");font-weight:${weight};font-style:normal;font-display:swap;}`;
    }),
  ).join("\n");
}
