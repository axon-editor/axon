import { type AxonSettings } from "../../../../shared/settings";

export const FONT_PRESET_VALUES: Record<
  AxonSettings["editor"]["fontPreset"],
  Pick<
    AxonSettings["editor"],
    | "fontPreset"
    | "uiFontFamily"
    | "fontFamily"
    | "fontWeight"
    | "lineHeight"
    | "fontLigatures"
  > &
    Partial<Pick<AxonSettings["editor"], "fontSize">>
> = {
  "axon-default": {
    fontPreset: "axon-default",
    uiFontFamily: ".AxonSans",
    fontFamily: ".AxonMono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: true,
  },
  "zed-like": {
    fontPreset: "zed-like",
    uiFontFamily: ".ZedSans",
    fontFamily: ".ZedMono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: true,
  },
  "jetbrains-mono": {
    fontPreset: "jetbrains-mono",
    uiFontFamily: ".AxonSans",
    fontFamily: "JetBrains Mono",
    fontWeight: 400,
    lineHeight: 23,
    fontLigatures: true,
  },
  "sf-mono": {
    fontPreset: "sf-mono",
    uiFontFamily: "SF Pro Text",
    fontFamily: "SF Mono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: false,
  },
  "fira-code": {
    fontPreset: "fira-code",
    uiFontFamily: ".AxonSans",
    fontFamily: "Fira Code",
    fontWeight: 400,
    lineHeight: 23,
    fontLigatures: true,
  },
  "geist-mono": {
    fontPreset: "geist-mono",
    uiFontFamily: "Inter",
    fontFamily: "Geist Mono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: false,
  },
  "cascadia-code": {
    fontPreset: "cascadia-code",
    uiFontFamily: ".AxonSans",
    fontFamily: "Cascadia Code",
    fontWeight: 400,
    lineHeight: 23,
    fontLigatures: true,
  },
  "berkeley-mono": {
    fontPreset: "berkeley-mono",
    uiFontFamily: ".AxonSans",
    fontFamily: "Berkeley Mono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: false,
  },
  "monaspace-neon-nerd": {
    fontPreset: "monaspace-neon-nerd",
    uiFontFamily: ".AxonSans",
    fontFamily: "Monaspace Neon NF",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: true,
  },
  "apathy-ocean": {
    fontPreset: "apathy-ocean",
    uiFontFamily: ".AxonSans",
    fontFamily: "Monaspace Neon NF",
    fontSize: 11,
    fontWeight: 200,
    lineHeight: 18,
    fontLigatures: true,
  },
};
