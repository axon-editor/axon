import type { ManagedLanguageToolId } from "../../shared/languageTools";

export interface ManagedLanguageToolCatalogEntry {
  id: ManagedLanguageToolId;
  label: string;
  languages: string[];
  repository?: string;
  githubTag?: string;
  expectedSha256ByPlatform?: Partial<Record<string, string>>;
  openVsx?: {
    namespace: string;
    extension: string;
    version: string;
    platforms: string[];
  };
  pinnedGithubAsset?: {
    tag: string;
    name: string;
    size: number;
    sha256: string;
    platforms: string[];
  };
  dotnetSdk?: {
    channel: string;
    version: string;
    ridByPlatform: Partial<Record<string, string>>;
  };
  dependencies?: ManagedLanguageToolId[];
  hidden?: boolean;
  executableNames: string[];
  commandName: string;
  windowsCommandName: string;
  assetNames: Partial<Record<string, string>>;
  assetPatterns?: Partial<Record<string, RegExp>>;
}

export const MANAGED_LANGUAGE_TOOL_CATALOG: ManagedLanguageToolCatalogEntry[] = [
  {
    id: "cpp",
    label: "C and C++",
    languages: ["c", "cpp"],
    repository: "clangd/clangd",
    githubTag: "22.1.6",
    expectedSha256ByPlatform: {
      "darwin-arm64": "631aef462556cbd74e0ebaae1778a38d1997d0ba3371652ca54f82652a179e7d",
      "darwin-x64": "631aef462556cbd74e0ebaae1778a38d1997d0ba3371652ca54f82652a179e7d",
      "linux-x64": "a9c77443af2e447ed467e84771848d3a6ac1c56f84bcfcde717e66318de77cfa",
      "win32-x64": "ce54f16e0b4fd76d450eeda9664420b195360b73febcfe40e661108fa57f2ce1",
    },
    executableNames: ["clangd", "clangd.exe"],
    commandName: "clangd",
    windowsCommandName: "clangd.cmd",
    assetNames: {},
    assetPatterns: {
      "darwin-arm64": /^clangd-mac-\d+\.\d+\.\d+\.zip$/,
      "darwin-x64": /^clangd-mac-\d+\.\d+\.\d+\.zip$/,
      "linux-x64": /^clangd-linux-\d+\.\d+\.\d+\.zip$/,
      "win32-x64": /^clangd-windows-\d+\.\d+\.\d+\.zip$/,
    },
  },
  {
    id: "csharp",
    label: "C#",
    languages: ["csharp"],
    repository: "OmniSharp/omnisharp-roslyn",
    githubTag: "v1.39.15",
    expectedSha256ByPlatform: {
      "darwin-arm64": "ae9ccca3ef1c4a4a3fbae7186a02bbc6c1290d8f4e2c845a214dabaf03cd7103",
      "darwin-x64": "bd2d273aff669645bdac2ee382d3a9c0220381b725a78697c9f6b6df9d22dafb",
      "linux-arm64": "f98302d820dc60766f8cb37a4bb3da403b69c162c66c2a3c1c2ee63f89dc9b64",
      "linux-x64": "e34b2ad29c31202b05dbdc1439600f98ea38acf656f84817c52e3dda81879f6c",
      "win32-arm64": "b8294f77e368a85875767f8e3a82cd4f9c8de2ecc727d71d0dd378a9107c4588",
      "win32-x64": "b03eb6b9ac6446fce803b87c0965e94cef5570cc86f47bfefe2f60933d8658e8",
    },
    dependencies: ["dotnet-sdk"],
    executableNames: ["OmniSharp", "OmniSharp.exe", "omnisharp"],
    commandName: "OmniSharp",
    windowsCommandName: "OmniSharp.cmd",
    assetNames: {},
    assetPatterns: {
      "darwin-arm64": /^omnisharp-osx-arm64-net6\.0\.tar\.gz$/,
      "darwin-x64": /^omnisharp-osx-x64-net6\.0\.tar\.gz$/,
      "linux-arm64": /^omnisharp-linux-arm64-net6\.0\.tar\.gz$/,
      "linux-x64": /^omnisharp-linux-x64-net6\.0\.tar\.gz$/,
      "win32-arm64": /^omnisharp-win-arm64-net6\.0\.zip$/,
      "win32-x64": /^omnisharp-win-x64-net6\.0\.zip$/,
    },
  },
  {
    id: "dotnet-sdk",
    label: ".NET SDK",
    languages: [],
    dotnetSdk: {
      channel: "8.0",
      version: "8.0.423",
      ridByPlatform: {
        "darwin-arm64": "osx-arm64",
        "darwin-x64": "osx-x64",
        "linux-arm64": "linux-arm64",
        "linux-x64": "linux-x64",
        "win32-arm64": "win-arm64",
        "win32-x64": "win-x64",
      },
    },
    hidden: true,
    executableNames: ["dotnet", "dotnet.exe"],
    commandName: "dotnet",
    windowsCommandName: "dotnet.cmd",
    assetNames: {},
  },
  {
    id: "java",
    label: "Java",
    languages: ["java"],
    openVsx: {
      namespace: "redhat",
      extension: "java",
      version: "1.55.0",
      platforms: [
        "darwin-arm64",
        "darwin-x64",
        "linux-arm64",
        "linux-x64",
        "win32-arm64",
        "win32-x64",
      ],
    },
    executableNames: ["jdtls", "jdtls.bat"],
    commandName: "jdtls",
    windowsCommandName: "jdtls.cmd",
    assetNames: {},
  },
  {
    id: "kotlin",
    label: "Kotlin",
    languages: ["kotlin"],
    repository: "fwcd/kotlin-language-server",
    pinnedGithubAsset: {
      tag: "1.3.13",
      name: "server.zip",
      size: 87_291_855,
      sha256: "4fe7d71d087b307c7869036171bd9d8c6a4284cd7c25b89098b0a24eb2d9b6d2",
      platforms: [
        "darwin-arm64",
        "darwin-x64",
        "linux-arm64",
        "linux-x64",
        "win32-arm64",
        "win32-x64",
      ],
    },
    dependencies: ["java"],
    executableNames: ["kotlin-language-server", "kotlin-language-server.bat"],
    commandName: "kotlin-language-server",
    windowsCommandName: "kotlin-language-server.cmd",
    assetNames: {},
  },
  {
    id: "lua",
    label: "Lua",
    languages: ["lua"],
    repository: "LuaLS/lua-language-server",
    githubTag: "3.18.2",
    expectedSha256ByPlatform: {
      "darwin-arm64": "cec99d70b1f612acec4a10a79a03664e3aa0c229d4d8a586cb3f928ec37d509e",
      "darwin-x64": "e26cfefe423dd7326fc7c649539e4d4aaa4f35f34d2fefd8af2ed7090b72c556",
      "linux-arm64": "273af33f26f4a1143f27c96d9f9e1188aba619c71e0807042134f66b4bd27f24",
      "linux-x64": "ca71415dd19f19e30aaa35a4915aefca9fdb5fec31b98331cc3d77f778d539c5",
      "win32-x64": "a4439a8f5e8e9e6505c11f045a7bf45db602124a1e246371c1dbe34924f3cf71",
    },
    executableNames: ["lua-language-server", "lua-language-server.exe"],
    commandName: "lua-language-server",
    windowsCommandName: "lua-language-server.cmd",
    assetNames: {},
    assetPatterns: {
      "darwin-arm64": /darwin-arm64\.tar\.gz$/,
      "darwin-x64": /darwin-x64\.tar\.gz$/,
      "linux-arm64": /linux-arm64\.tar\.gz$/,
      "linux-x64": /linux-x64\.tar\.gz$/,
      "win32-x64": /win32-x64\.zip$/,
    },
  },
  {
    id: "proto",
    label: "Protocol Buffers",
    languages: ["proto"],
    repository: "coder3101/protols",
    githubTag: "0.14.1",
    expectedSha256ByPlatform: {
      "darwin-arm64": "1d1345864055fac1cbdfc1f38bc60b417d925649f710fb5c628e93168f8bde81",
      "darwin-x64": "b568d90b8cad304ca82d9a50ae23b3834f4ef5d742d71aee8fc8149a31aa8589",
      "linux-arm64": "0e9ce291a05d5d89286689e9013111a4ce91f5f20b694e96e3862abf9f4669dd",
      "linux-x64": "722f844f46a3b07b1d6d8b75c25a04475cab9022f5d933b3fb646c5a69f8cc5d",
      "win32-x64": "e8b185abf56c813a44521df3045ae0893a1ff7608fa8735769e50bc3b4fb8b5a",
    },
    executableNames: ["protols", "protols.exe"],
    commandName: "protols",
    windowsCommandName: "protols.cmd",
    assetNames: {
      "darwin-arm64": "protols-aarch64-apple-darwin.tar.gz",
      "darwin-x64": "protols-x86_64-apple-darwin.tar.gz",
      "linux-arm64": "protols-aarch64-unknown-linux-gnu.tar.gz",
      "linux-x64": "protols-x86_64-unknown-linux-gnu.tar.gz",
      "win32-x64": "protols-x86_64-pc-windows-msvc.zip",
    },
  },
  {
    id: "rust",
    label: "Rust",
    languages: ["rust"],
    repository: "rust-lang/rust-analyzer",
    githubTag: "2026-04-13",
    expectedSha256ByPlatform: {
      "darwin-arm64": "6582dc2f3c8415fe3d374137f554f1d4820d7e77dd201894fdcb7f8938a7f72a",
      "darwin-x64": "79062397cdd377aa544ec422f0be236fb7aea6ab3c71f66bf483ddb97ade3b57",
      "linux-arm64": "5b74525bb9de86f48861ecba254e2f3a0acc398761cd38f3a345c8be02e453d2",
      "linux-x64": "4b5ce83e9e9d7dd8bcfe2990321b71e7ce0f30ee8271f5f24b838e919e95194c",
      "win32-arm64": "f9c18349f09e46696bfad564a92f0ea94a1185a04cdd2a3334652bcea0f9b5d7",
      "win32-x64": "7ee75370c896bb2faed71f3ad1bb15708957fcc43a338177e6cba38d3f0b99f6",
    },
    executableNames: [
      "rust-analyzer",
      "rust-analyzer.exe",
      "rust-analyzer-aarch64-apple-darwin",
      "rust-analyzer-x86_64-apple-darwin",
      "rust-analyzer-aarch64-unknown-linux-gnu",
      "rust-analyzer-x86_64-unknown-linux-gnu",
    ],
    commandName: "rust-analyzer",
    windowsCommandName: "rust-analyzer.cmd",
    assetNames: {
      "darwin-arm64": "rust-analyzer-aarch64-apple-darwin.gz",
      "darwin-x64": "rust-analyzer-x86_64-apple-darwin.gz",
      "linux-arm64": "rust-analyzer-aarch64-unknown-linux-gnu.gz",
      "linux-x64": "rust-analyzer-x86_64-unknown-linux-gnu.gz",
      "win32-arm64": "rust-analyzer-aarch64-pc-windows-msvc.zip",
      "win32-x64": "rust-analyzer-x86_64-pc-windows-msvc.zip",
    },
  },
  {
    id: "xml",
    label: "XML",
    languages: ["xml"],
    repository: "redhat-developer/vscode-xml",
    githubTag: "0.29.3",
    expectedSha256ByPlatform: {
      "darwin-arm64": "185db5630ce85be43ea0fab034e7841b1327c2793db05ab481e029cf493d86ce",
      "darwin-x64": "9e56123194b5c1fdc7d87f1bd21c83cc996ba7be913def3a2836a13305bcd273",
      "linux-arm64": "0b88a49e83c2611282672f5123ce33abf1371c8e3c55cad6ee45ea00626ffa1b",
      "linux-x64": "1acc44e24201c1d2f5ccb4e43e7426ed0df6909207a81ff199810e2808104d89",
      "win32-x64": "7eaefaac68253b0ec8e0ad1f1c0f2d0755423d4e99e52497428b52f80df28eb7",
    },
    executableNames: ["lemminx", "lemminx.exe"],
    commandName: "lemminx",
    windowsCommandName: "lemminx.cmd",
    assetNames: {
      "darwin-arm64": "lemminx-osx-aarch_64.zip",
      "darwin-x64": "lemminx-osx-x86_64.zip",
      "linux-arm64": "lemminx-linux-aarch_64.zip",
      "linux-x64": "lemminx-linux-x86_64.zip",
      "win32-x64": "lemminx-win32.zip",
    },
  },
];

export function getManagedLanguageToolCatalogEntry(
  id: ManagedLanguageToolId,
) {
  return MANAGED_LANGUAGE_TOOL_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function getManagedLanguageToolForLanguage(languageId: string) {
  const normalizedLanguageId = languageId.trim().toLowerCase();
  return (
    MANAGED_LANGUAGE_TOOL_CATALOG.find((entry) =>
      entry.languages.includes(normalizedLanguageId),
    ) ?? null
  );
}

export function getManagedLanguageToolPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

export function findManagedLanguageToolAssetName(
  entry: ManagedLanguageToolCatalogEntry,
  candidateNames: string[],
  platformKey = getManagedLanguageToolPlatformKey(),
) {
  const exactName = entry.assetNames[platformKey];
  if (exactName) return candidateNames.includes(exactName) ? exactName : null;

  const pattern = entry.assetPatterns?.[platformKey];
  return pattern
    ? candidateNames.find((candidateName) => pattern.test(candidateName)) ?? null
    : null;
}
