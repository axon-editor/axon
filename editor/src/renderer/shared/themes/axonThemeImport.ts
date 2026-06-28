import { type AxonThemeDefinition, type ThemeTokenMap } from "./types";

interface AxonThemeImportInput {
  id: AxonThemeDefinition["id"];
  label: string;
  appearance: "dark" | "light";
  tokens: ThemeTokenMap;
  monacoColors: AxonThemeDefinition["monacoColors"];
}

export function createAxonThemeImport(
  input: AxonThemeImportInput,
): AxonThemeDefinition {
  // Imported Axon theme packs carry interface colors and syntax colors as
  // separate sections. The renderer needs one built-in theme object with
  // normalized UI tokens, Monaco colors, and syntax mappings, so this adapter
  // keeps imported packs on the same path as native Axon themes instead of
  // adding a second registration system.
  return {
    id: input.id,
    label: input.label,
    base: input.appearance === "light" ? "vs" : "vs-dark",
    tokens: input.tokens,
    monacoColors: input.monacoColors,
  };
}
