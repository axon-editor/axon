import { publicAsset } from "./assets";

const MONASPACE_NERD_WEIGHTS = [
  ["ExtraLight", 200],
  ["Light", 300],
  ["Regular", 400],
  ["Medium", 500],
  ["SemiBold", 600],
  ["Bold", 700],
  ["ExtraBold", 800],
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

      // The Nerd Font files are bundled as public renderer assets so they work
      // in both dev and packaged builds. Registering every core weight under
      // the same family lets Axon's existing font-weight setting produce the
      // soft Apathy/Ocean look without requiring users to import each file by
      // hand.
      return `@font-face{font-family:"${family}";src:url("${url}") format("opentype");font-weight:${weight};font-style:normal;font-display:swap;}`;
    }),
  ).join("\n");
}
