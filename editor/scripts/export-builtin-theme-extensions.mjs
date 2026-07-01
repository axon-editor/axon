import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";

const editorRoot = process.cwd();
const workspaceRoot = path.resolve(editorRoot, "..");
const jiti = createJiti(import.meta.url);

const { axonDarkTheme } = jiti("../src/renderer/shared/themes/axonDark.ts");
const { axonMoonlightTheme } = jiti("../src/renderer/shared/themes/axonMoonlight.ts");
const { soraTheme } = jiti("../src/renderer/shared/themes/sora.ts");
const { zedDarkTheme } = jiti("../src/renderer/shared/themes/zedDark.ts");
const { catppuccinMochaTheme } = jiti("../src/renderer/shared/themes/catppuccinMocha.ts");
const { ayuDarkTheme, ayuLightTheme, ayuMirageTheme } = jiti("../src/renderer/shared/themes/ayuDark.ts");
const { oneThemes } = jiti("../src/renderer/shared/themes/one.ts");
const { solarizedThemes } = jiti("../src/renderer/shared/themes/solarized.ts");

const themePackages = [
  {
    folder: "axon",
    id: "axon.themes",
    name: "Axon Themes",
    description: "Built-in Axon, Axon Moonlight, and Sora themes.",
    themes: [axonDarkTheme, axonMoonlightTheme, soraTheme],
  },
  {
    folder: "zed",
    id: "axon.zed-theme",
    name: "Zed Theme",
    description: "Built-in Zed-inspired dark theme.",
    themes: [zedDarkTheme],
  },
  {
    folder: "catppuccin",
    id: "axon.catppuccin-theme",
    name: "Catppuccin",
    description: "Built-in Catppuccin Mocha theme.",
    themes: [catppuccinMochaTheme],
  },
  {
    folder: "ayu",
    id: "axon.ayu-theme",
    name: "Ayu",
    description: "Built-in Ayu Dark, Ayu Light, and Ayu Mirage themes.",
    themes: [ayuDarkTheme, ayuLightTheme, ayuMirageTheme],
  },
  {
    folder: "one",
    id: "axon.one-theme",
    name: "One",
    description: "Built-in One Dark and One Light themes.",
    themes: oneThemes,
  },
  {
    folder: "solarized",
    id: "axon.solarized-theme",
    name: "Solarized",
    description: "Built-in Solarized Dark and Solarized Light themes.",
    themes: solarizedThemes,
  },
];

function themeJson(theme) {
  return {
    $schema: "https://axoneditor.com/schemas/theme/v0.1.0.json",
    id: theme.id,
    name: theme.label,
    appearance: theme.base === "vs" ? "light" : "dark",
    ui: theme.tokens,
    monaco: theme.monacoColors ?? {},
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

for (const themePackage of themePackages) {
  const packageRoot = path.resolve(
    workspaceRoot,
    "extensions/builtin/themes",
    themePackage.folder,
  );
  const themesRoot = path.join(packageRoot, "themes");
  const contributions = themePackage.themes.map((theme) => ({
    id: theme.id,
    label: theme.label,
    path: `./themes/${theme.id}.json`,
  }));

  writeJson(path.join(packageRoot, "axon.extension.json"), {
    $schema: "https://axoneditor.com/schemas/extension/v0.1.0.json",
    id: themePackage.id,
    name: themePackage.name,
    publisher: "Axon",
    version: "1.0.0",
    description: themePackage.description,
    author: "Axon",
    categories: ["Themes"],
    activationEvents: ["onStartup"],
    contributes: {
      themes: contributions,
    },
  });

  for (const theme of themePackage.themes) {
    writeJson(path.join(themesRoot, `${theme.id}.json`), themeJson(theme));
  }
}
