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
  pinnedGithubAssets?: Partial<
    Record<
      string,
      { tag: string; name: string; size: number; sha256: string }
    >
  >;
  pinnedHttpsAssets?: Partial<
    Record<
      string,
      {
        version: string;
        name: string;
        size: number;
        sha256: string;
        url: string;
      }
    >
  >;
  dotnetSdk?: {
    channel: string;
    version: string;
    ridByPlatform: Partial<Record<string, string>>;
  };
  ecosystemInstaller?:
    | {
        kind: "system-command";
        version: string;
        runtimeCommands: string[];
      }
    | {
        kind: "python-venv" | "ruby-gem" | "r-package" | "coursier";
        version: string;
        packageName: string;
        runtimeCommands: string[];
      };
  launcher?: {
    kind: "powershell-editor-services" | "java-coursier";
    runtimeDependency: ManagedLanguageToolId;
    artifact?: string;
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
  {
    id: "sql",
    label: "SQL",
    languages: ["sql"],
    repository: "lighttiger2505/sqls",
    githubTag: "v0.2.48",
    expectedSha256ByPlatform: {
      "darwin-x64": "b44165ca597a4b4298d56657bc911aa3ca8a591befefde4e29566923c6229f3d",
      "linux-x64": "30047b92c41658c821b7803d2c2a3a1ce4e17ee769ceff6f24bb9e3daaf5d4dc",
      "win32-x64": "df6453b2ddcb4e748547d0288b826251a24af099749dc7a9ddea587aac3d4365",
    },
    executableNames: ["sqls", "sqls.exe"],
    commandName: "sqls",
    windowsCommandName: "sqls.cmd",
    assetNames: {
      "darwin-x64": "sqls-darwin-0.2.48.zip",
      "linux-x64": "sqls-linux-0.2.48.zip",
      "win32-x64": "sqls-windows-0.2.48.zip",
    },
  },
  {
    id: "dart",
    label: "Dart",
    languages: ["dart"],
    pinnedHttpsAssets: {
      "darwin-arm64": { version: "3.12.2", name: "dartsdk-macos-arm64-release.zip", size: 215_274_228, sha256: "cd8753928e77b6b665bd70dce0e64b4ec6d2e2fde141d6409bb716c8ac1f1c0a", url: "https://storage.googleapis.com/dart-archive/channels/stable/release/3.12.2/sdk/dartsdk-macos-arm64-release.zip" },
      "darwin-x64": { version: "3.12.2", name: "dartsdk-macos-x64-release.zip", size: 217_963_426, sha256: "38199f56fe22f2235e76799191d5b9516e360369c61b6ba4411398d5d5920bab", url: "https://storage.googleapis.com/dart-archive/channels/stable/release/3.12.2/sdk/dartsdk-macos-x64-release.zip" },
      "linux-arm64": { version: "3.12.2", name: "dartsdk-linux-arm64-release.zip", size: 230_513_702, sha256: "f82c83ece7d168047550dfd4a664e4071ac7c488bddb72dc43102c22d7e0b518", url: "https://storage.googleapis.com/dart-archive/channels/stable/release/3.12.2/sdk/dartsdk-linux-arm64-release.zip" },
      "linux-x64": { version: "3.12.2", name: "dartsdk-linux-x64-release.zip", size: 233_130_148, sha256: "28e47b44cf075f36771046c068bb0d174201cf9c7608744aed1cc23204299c2d", url: "https://storage.googleapis.com/dart-archive/channels/stable/release/3.12.2/sdk/dartsdk-linux-x64-release.zip" },
      "win32-x64": { version: "3.12.2", name: "dartsdk-windows-x64-release.zip", size: 214_147_239, sha256: "77fd96c823ed09a85e58209a2c5f16b0fc02e5ed4f3e3d46fddf4be763d498d6", url: "https://storage.googleapis.com/dart-archive/channels/stable/release/3.12.2/sdk/dartsdk-windows-x64-release.zip" },
    },
    executableNames: ["dart", "dart.exe"],
    commandName: "dart",
    windowsCommandName: "dart.cmd",
    assetNames: {},
  },
  {
    id: "zig",
    label: "Zig",
    languages: ["zig"],
    repository: "zigtools/zls",
    githubTag: "0.16.0",
    expectedSha256ByPlatform: {
      "darwin-arm64": "b93ec549f8558a7e85984a840e9276d274f1059b54ade4254296ef4982958359",
      "darwin-x64": "49f716ea96c1aadaecaa5d9c0a50874cbcf443dc42b825f1e7ee35499ad3eb96",
      "linux-arm64": "430cd293d201eb70ae2519dbc96c854bf8791b8df7fc9392e8d2dc9680a2bed7",
      "linux-x64": "ded6d562a0b86ee878b1ddf70ffab2797ce3cdca3b02d6077548f9d56dff96b6",
      "win32-arm64": "ef4c5ccb93c80c9f023105c5f558ae8774ac6668d560ba6f92a2f87d95df2311",
      "win32-x64": "35cbb7163224e8cf92d21099c1b1391f2aba927f25d389f021b13a21d40b96dd",
    },
    executableNames: ["zls", "zls.exe"],
    commandName: "zls",
    windowsCommandName: "zls.cmd",
    assetNames: {
      "darwin-arm64": "zls-aarch64-macos.tar.xz",
      "darwin-x64": "zls-x86_64-macos.tar.xz",
      "linux-arm64": "zls-aarch64-linux.tar.xz",
      "linux-x64": "zls-x86_64-linux.tar.xz",
      "win32-arm64": "zls-aarch64-windows.zip",
      "win32-x64": "zls-x86_64-windows.zip",
    },
  },
  {
    id: "toml",
    label: "TOML",
    languages: ["toml"],
    repository: "tamasfe/taplo",
    pinnedGithubAssets: {
      "darwin-arm64": { tag: "0.10.0", name: "taplo-darwin-aarch64.gz", size: 4_616_415, sha256: "713734314c3e71894b9e77513c5349835eefbd52908445a0d73b0c7dc469347d" },
      "darwin-x64": { tag: "0.10.0", name: "taplo-darwin-x86_64.gz", size: 4_921_954, sha256: "898122cde3a0b1cd1cbc2d52d3624f23338218c91b5ddb71518236a4c2c10ef2" },
      "linux-arm64": { tag: "0.10.0", name: "taplo-linux-aarch64.gz", size: 4_631_779, sha256: "033681d01eec8376c3fd38fa3703c79316f5e14bb013d859943b60a07bccdcc3" },
      "linux-x64": { tag: "0.10.0", name: "taplo-linux-x86_64.gz", size: 5_116_068, sha256: "8fe196b894ccf9072f98d4e1013a180306e17d244830b03986ee5e8eabeb6156" },
      "win32-arm64": { tag: "0.10.0", name: "taplo-windows-aarch64.zip", size: 4_810_289, sha256: "65a50c5d3b78f6014e6bc6d64eb6dc1d4992bc236589c9bb29e5609fc3454674" },
      "win32-x64": { tag: "0.10.0", name: "taplo-windows-x86_64.zip", size: 5_182_591, sha256: "1615eed140039bd58e7089109883b1c434de5d6de8f64a993e6e8c80ca57bdf9" },
    },
    executableNames: [
      "taplo",
      "taplo.exe",
      "taplo-darwin-aarch64",
      "taplo-darwin-x86_64",
      "taplo-linux-aarch64",
      "taplo-linux-x86_64",
    ],
    commandName: "taplo",
    windowsCommandName: "taplo.cmd",
    assetNames: {},
  },
  {
    id: "latex",
    label: "LaTeX and BibTeX",
    languages: ["latex", "bibtex"],
    repository: "latex-lsp/texlab",
    githubTag: "v5.26.0",
    expectedSha256ByPlatform: {
      "darwin-arm64": "af7972ffd230711ba04ada9b69cc32ce9111d9196ba69538062872faefdbee56",
      "darwin-x64": "6091611f756b28e1a57612b130c196df4b0bb6e22dde5cf5d890578513397daf",
      "linux-arm64": "a85cdfcd22454b8d8550f4b0f0620c45ab51760f302fac7a12bc18a890f70f8c",
      "linux-x64": "8697bd5e479d4584b14b7eed5c320c80ec4e1d91ebefbb6801e6bf38e9971300",
      "win32-arm64": "99b215e9a44169eb8d786c33484b963055e1c3dd40f68e14fcc47ae1c84e92c1",
      "win32-x64": "cb028d44c3d2b85d36a2ed52d41a0ff43a341b1f04c500c56c4524c4eb72b316",
    },
    executableNames: ["texlab", "texlab.exe"],
    commandName: "texlab",
    windowsCommandName: "texlab.cmd",
    assetNames: {
      "darwin-arm64": "texlab-aarch64-macos.tar.gz",
      "darwin-x64": "texlab-x86_64-macos.tar.gz",
      "linux-arm64": "texlab-aarch64-linux.tar.gz",
      "linux-x64": "texlab-x86_64-linux.tar.gz",
      "win32-arm64": "texlab-aarch64-windows.zip",
      "win32-x64": "texlab-x86_64-windows.zip",
    },
  },
  {
    id: "terraform",
    label: "Terraform and HCL",
    languages: ["terraform", "hcl"],
    pinnedHttpsAssets: {
      "darwin-arm64": { version: "0.38.8", name: "terraform-ls_0.38.8_darwin_arm64.zip", size: 30_012_654, sha256: "510a506f7bf1550294202347261961e52daa4664a795e2deffbf7df7296b1f6c", url: "https://releases.hashicorp.com/terraform-ls/0.38.8/terraform-ls_0.38.8_darwin_arm64.zip" },
      "darwin-x64": { version: "0.38.8", name: "terraform-ls_0.38.8_darwin_amd64.zip", size: 30_709_588, sha256: "34cfe6cbbb61da5b8fd21721e14be0f134417f249350872da1669454dc8762a4", url: "https://releases.hashicorp.com/terraform-ls/0.38.8/terraform-ls_0.38.8_darwin_amd64.zip" },
      "linux-arm64": { version: "0.38.8", name: "terraform-ls_0.38.8_linux_arm64.zip", size: 29_620_863, sha256: "762db754428dd188b949533ca05437955e26f4b3fc699d4b93392668a24e7a10", url: "https://releases.hashicorp.com/terraform-ls/0.38.8/terraform-ls_0.38.8_linux_arm64.zip" },
      "linux-x64": { version: "0.38.8", name: "terraform-ls_0.38.8_linux_amd64.zip", size: 30_326_575, sha256: "d16077d9c83f13ac33501af49ea75f43218d3fa2437c6c1374550b2625edc3ef", url: "https://releases.hashicorp.com/terraform-ls/0.38.8/terraform-ls_0.38.8_linux_amd64.zip" },
      "win32-arm64": { version: "0.38.8", name: "terraform-ls_0.38.8_windows_arm64.zip", size: 29_677_853, sha256: "5cee26a3645487125bf65daee8cfc85c84d8c7e03bbb00662fb12225afe9d6cd", url: "https://releases.hashicorp.com/terraform-ls/0.38.8/terraform-ls_0.38.8_windows_arm64.zip" },
      "win32-x64": { version: "0.38.8", name: "terraform-ls_0.38.8_windows_amd64.zip", size: 30_467_602, sha256: "5152e76e45103ea2a31b8a8dadc43833ae559a4aba4cb12f57c1c006c11dda8c", url: "https://releases.hashicorp.com/terraform-ls/0.38.8/terraform-ls_0.38.8_windows_amd64.zip" },
    },
    executableNames: ["terraform-ls", "terraform-ls.exe"],
    commandName: "terraform-ls",
    windowsCommandName: "terraform-ls.cmd",
    assetNames: {},
  },
  {
    id: "clojure",
    label: "Clojure",
    languages: ["clojure"],
    repository: "clojure-lsp/clojure-lsp",
    githubTag: "2026.07.06-14.34.19",
    expectedSha256ByPlatform: {
      "darwin-arm64": "dd9a8e36add53b8d8166bb3d7580c6e5563401aea87b62600786af2e7d37ccde",
      "darwin-x64": "0449f7f8fc975157cb4e5cdcf365bcd43bcf1fa47b99256427e7a86e4c17fc3f",
      "linux-arm64": "0595e65a5934d3208246f529b5cf0497d7167d7e9b8317e9b391e05b5c0906d7",
      "linux-x64": "520f724ee02f4b3ecb225395a7a5a4ccad3878d6d1418240cd9636afcf9b858e",
      "win32-x64": "7b978ab266f7aa0ecf48b7484fc0aa6d3b3b7b395c27c47c949d6ce93174599d",
    },
    executableNames: ["clojure-lsp", "clojure-lsp.exe"],
    commandName: "clojure-lsp",
    windowsCommandName: "clojure-lsp.cmd",
    assetNames: {
      "darwin-arm64": "clojure-lsp-native-macos-aarch64.zip",
      "darwin-x64": "clojure-lsp-native-macos-amd64.zip",
      "linux-arm64": "clojure-lsp-native-linux-aarch64.zip",
      "linux-x64": "clojure-lsp-native-linux-amd64.zip",
      "win32-x64": "clojure-lsp-native-windows-amd64.zip",
    },
  },
  {
    id: "erlang",
    label: "Erlang",
    languages: ["erlang"],
    repository: "WhatsApp/erlang-language-platform",
    githubTag: "2026-06-10",
    expectedSha256ByPlatform: {
      "darwin-arm64": "ed9e8b7ae0e6eab54eec5f759570cde2f32efd060487d946ac449d7e8eec347f",
      "darwin-x64": "b8bdfdf209d34e7cf9d41220bdbb929d9cb52349a204b93e04f6fbf2abb199c0",
      "linux-arm64": "dd33a48bc909a5e7eedb5240302e49e740faa024e3d37608bfa05b26249bee58",
      "linux-x64": "104450964d8f43d85294d106fd6a5bf6094b88aef7a94685aeb719735d839fb7",
      "win32-x64": "0060037ac353fd22908ca689e80d80d8522f98dd6ee55b977f1b7a4063514e78",
    },
    executableNames: ["elp", "elp.exe"],
    commandName: "elp",
    windowsCommandName: "elp.cmd",
    assetNames: {
      "darwin-arm64": "elp-macos-aarch64-apple-darwin-otp-28.tar.gz",
      "darwin-x64": "elp-macos-x86_64-apple-darwin-otp-28.tar.gz",
      "linux-arm64": "elp-linux-aarch64-unknown-linux-gnu-otp-28.tar.gz",
      "linux-x64": "elp-linux-x86_64-unknown-linux-gnu-otp-28.tar.gz",
      "win32-x64": "elp-windows-x86_64-pc-windows-msvc-otp-28.tar.gz",
    },
  },
  {
    id: "haskell",
    label: "Haskell",
    languages: ["haskell"],
    repository: "haskell/haskell-language-server",
    githubTag: "2.14.0.0",
    expectedSha256ByPlatform: {
      "darwin-arm64": "934ce8d82ef53ac2f649dbd0535d4d9c059d8e2a90c71ea41b97929e00f6e462",
      "darwin-x64": "c4000ef74d7f544e5dc5a76215403fe798c5de57206cdba03bdbef1eecba5800",
      "linux-arm64": "7d2e9356487a802a2ccf903f570872c028fb91b1d34906629c3a0054a1f33daa",
      "linux-x64": "25d9ef724fd979c5838f82ea90c98a7460248e3f42894aa54afedbcbb1f87436",
      "win32-x64": "b928e205dfd09d2b75986f19bc37700dcd74037bf695c5663a7454d84e3409e7",
    },
    executableNames: [
      "haskell-language-server-wrapper",
      "haskell-language-server-wrapper.exe",
    ],
    commandName: "haskell-language-server-wrapper",
    windowsCommandName: "haskell-language-server-wrapper.cmd",
    assetNames: {
      "darwin-arm64": "haskell-language-server-2.14.0.0-aarch64-apple-darwin.tar.xz",
      "darwin-x64": "haskell-language-server-2.14.0.0-x86_64-apple-darwin.tar.xz",
      "linux-arm64": "haskell-language-server-2.14.0.0-aarch64-linux-ubuntu2204.tar.xz",
      "linux-x64": "haskell-language-server-2.14.0.0-x86_64-linux-unknown.tar.xz",
      "win32-x64": "haskell-language-server-2.14.0.0-x86_64-mingw64.zip",
    },
  },
  {
    id: "asm",
    label: "Assembly",
    languages: ["asm"],
    repository: "bergercookie/asm-lsp",
    githubTag: "v0.10.1",
    expectedSha256ByPlatform: {
      "darwin-arm64": "affc8917d5bb6f44805c2e964ad07cf7e0799ecfaa7686f7a5cea9efa00bc575",
      "darwin-x64": "900c0c95bb2cf0a65102beb09031496e3ed2d31b85dbbe3ef8cae5ffbe493a07",
      "linux-x64": "2a2f386c10348e365df484d5c66d084813e7dbf8ab4e9eb7a7cc0bb0acf2f8f8",
    },
    executableNames: ["asm-lsp", "asm-lsp.exe"],
    commandName: "asm-lsp",
    windowsCommandName: "asm-lsp.cmd",
    assetNames: {
      "darwin-arm64": "asm-lsp-aarch64-apple-darwin.tar.gz",
      "darwin-x64": "asm-lsp-x86_64-apple-darwin.tar.gz",
      "linux-x64": "asm-lsp-x86_64-unknown-linux-gnu.tar.gz",
    },
  },
  {
    id: "swift",
    label: "Swift",
    languages: ["swift"],
    ecosystemInstaller: {
      kind: "system-command",
      version: "system",
      runtimeCommands: ["sourcekit-lsp"],
    },
    executableNames: ["sourcekit-lsp", "sourcekit-lsp.exe"],
    commandName: "sourcekit-lsp",
    windowsCommandName: "sourcekit-lsp.cmd",
    assetNames: {},
  },
  {
    id: "ruby",
    label: "Ruby",
    languages: ["ruby"],
    ecosystemInstaller: {
      kind: "ruby-gem",
      version: "0.26.10",
      packageName: "ruby-lsp",
      runtimeCommands: ["ruby"],
    },
    executableNames: ["ruby-lsp", "ruby-lsp.cmd"],
    commandName: "ruby-lsp",
    windowsCommandName: "ruby-lsp.cmd",
    assetNames: {},
  },
  {
    id: "scala",
    label: "Scala",
    languages: ["scala"],
    openVsx: {
      namespace: "scalameta",
      extension: "metals",
      version: "1.68.0",
      platforms: ["universal"],
    },
    dependencies: ["java"],
    launcher: {
      kind: "java-coursier",
      runtimeDependency: "java",
      artifact: "org.scalameta:metals_2.13:1.6.7",
    },
    executableNames: ["coursier-fallback.jar"],
    commandName: "metals",
    windowsCommandName: "metals.cmd",
    assetNames: {},
  },
  {
    id: "r",
    label: "R",
    languages: ["r"],
    ecosystemInstaller: {
      kind: "r-package",
      version: "0.3.18",
      packageName: "languageserver",
      runtimeCommands: ["R"],
    },
    executableNames: ["R", "R.exe"],
    commandName: "R",
    windowsCommandName: "R.cmd",
    assetNames: {},
  },
  {
    id: "powershell-runtime",
    label: "PowerShell Runtime",
    languages: [],
    repository: "PowerShell/PowerShell",
    pinnedGithubAssets: {
      "darwin-arm64": { tag: "v7.6.3", name: "powershell-7.6.3-osx-arm64.tar.gz", size: 72_235_055, sha256: "f0263c2072fe7d0953781c60497a574bea99b37237f2554a59ce4bad07de8d36" },
      "darwin-x64": { tag: "v7.6.3", name: "powershell-7.6.3-osx-x64.tar.gz", size: 76_310_109, sha256: "f02073a442515877aa5a8f361f55866800100c41b665cfb64883b77dbba09412" },
      "linux-arm64": { tag: "v7.6.3", name: "powershell-7.6.3-linux-arm64.tar.gz", size: 73_554_413, sha256: "7a14a385eca7dc5bedc1c8aa3d8b765f449ada30aabe5785a9fd331266eb062d" },
      "linux-x64": { tag: "v7.6.3", name: "powershell-7.6.3-linux-x64.tar.gz", size: 77_543_414, sha256: "856d0765d2332377f9d7a4aea76efdfde4de51446e7738dde2dfda41dba9e2a7" },
      "win32-arm64": { tag: "v7.6.3", name: "PowerShell-7.6.3-win-arm64.zip", size: 110_176_268, sha256: "2ece90557c370bb5ee03275ef41f2a49e26ea85defcf2052aca32c20dadb62c2" },
      "win32-x64": { tag: "v7.6.3", name: "PowerShell-7.6.3-win-x64.zip", size: 116_931_488, sha256: "07ddb0d00b660459560ef82a9841da7705b27cd5dcca5a0d7b025a98eca29eca" },
    },
    hidden: true,
    executableNames: ["pwsh", "pwsh.exe"],
    commandName: "pwsh",
    windowsCommandName: "pwsh.cmd",
    assetNames: {},
  },
  {
    id: "powershell",
    label: "PowerShell",
    languages: ["powershell"],
    openVsx: {
      namespace: "ms-vscode",
      extension: "powershell",
      version: "2025.4.0",
      platforms: ["universal"],
    },
    dependencies: ["powershell-runtime"],
    launcher: {
      kind: "powershell-editor-services",
      runtimeDependency: "powershell-runtime",
    },
    executableNames: ["Start-EditorServices.ps1"],
    commandName: "PowerShellEditorServices",
    windowsCommandName: "PowerShellEditorServices.cmd",
    assetNames: {},
  },
  {
    id: "makefile",
    label: "Makefile",
    languages: ["makefile"],
    ecosystemInstaller: {
      kind: "python-venv",
      version: "0.0.23",
      packageName: "autotools-language-server",
      runtimeCommands: ["python3", "python"],
    },
    executableNames: ["autotools-language-server", "autotools-language-server.exe"],
    commandName: "autotools-language-server",
    windowsCommandName: "autotools-language-server.cmd",
    assetNames: {},
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
