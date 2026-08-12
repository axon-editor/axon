import { type AxonSettings } from "@axon-editor/shared/settings";

export const FONT_PRESET_VALUES: Record<
  AxonSettings["editor"]["fontPreset"],
  Pick<
    AxonSettings["editor"],
    | "fontPreset"
    | "fontFamily"
    | "fontWeight"
    | "lineHeight"
    | "fontLigatures"
  > &
    Partial<Pick<AxonSettings["editor"], "fontSize">>
> = {
  "axon-default": {
    fontPreset: "axon-default",
    fontFamily: ".AxonMono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: true,
  },
  "zed-like": {
    fontPreset: "zed-like",
    fontFamily: ".ZedMono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: true,
  },
  "jetbrains-mono": {
    fontPreset: "jetbrains-mono",
    fontFamily: "JetBrains Mono",
    fontWeight: 400,
    lineHeight: 23,
    fontLigatures: true,
  },
  "sf-mono": {
    fontPreset: "sf-mono",
    fontFamily: "SF Mono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: false,
  },
  "fira-code": {
    fontPreset: "fira-code",
    fontFamily: "Fira Code",
    fontWeight: 400,
    lineHeight: 23,
    fontLigatures: true,
  },
  "geist-mono": {
    fontPreset: "geist-mono",
    fontFamily: "Geist Mono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: false,
  },
  "cascadia-code": {
    fontPreset: "cascadia-code",
    fontFamily: "Cascadia Code",
    fontWeight: 400,
    lineHeight: 23,
    fontLigatures: true,
  },
  "berkeley-mono": {
    fontPreset: "berkeley-mono",
    fontFamily: "Berkeley Mono",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: false,
  },
  "monaspace-neon-nerd": {
    fontPreset: "monaspace-neon-nerd",
    fontFamily: "Monaspace Neon NF",
    fontWeight: 400,
    lineHeight: 22,
    fontLigatures: true,
  },
  "apathy-ocean": {
    fontPreset: "apathy-ocean",
    fontFamily: "Monaspace Neon NF",
    fontSize: 11,
    fontWeight: 200,
    lineHeight: 18,
    fontLigatures: true,
  },
};
