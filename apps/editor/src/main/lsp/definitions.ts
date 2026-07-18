import fs from "fs";
import path from "path";
import { type LanguageServerId } from "../../shared/lsp";
import { resolveBundledAppFilePath } from "./paths";

export interface LanguageServerDefinition {
  id: LanguageServerId;
  label: string;
  languages: string[];
  command: string;
  args: string[];
  launchArgs: string[];
  workspaceMarkers: string[];
  installHint: string;
  runtimeRequirement?: string;
  bundledNodeServer?: {
    packagePath: string[];
    scriptPath: string[];
  };
  managedBundle?: {
    directoryName: string;
    executableNames: string[];
    args?: string[];
    launchArgs?: string[];
  };
  resolveCommand?: (folderPath: string) => {
    command: string;
    args: string[];
    launchCommand: string;
    launchArgs: string[];
    env?: NodeJS.ProcessEnv;
    startable: boolean;
  };
}

export interface ResolvedLanguageServerCommand {
  command: string;
  args: string[];
  launchCommand: string;
  launchArgs: string[];
  env?: NodeJS.ProcessEnv;
  startable: boolean;
}

export interface LanguageServerStartAttempt {
  label: string;
  ok: boolean;
  message: string;
}

export const LANGUAGE_SERVER_DEFINITIONS: LanguageServerDefinition[] = [
  {
    id: "typescript",
    label: "TypeScript",
    languages: ["TypeScript", "JavaScript"],
    command: "typescript-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    installHint: "Install typescript-language-server and typescript.",
    resolveCommand: (folderPath) => {
      const workspaceServer = path.join(
        folderPath,
        "node_modules/.bin/typescript-language-server",
      );
      const workspaceTsc = path.join(
        folderPath,
        "node_modules/typescript/lib/tsserver.js",
      );
      const bundledServer = resolveBundledAppFilePath(
        "node_modules/typescript-language-server/lib/cli.mjs",
      );
      const runBundledServerWithElectronNode = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      };

      if (fs.existsSync(workspaceServer)) {
        return {
          command: workspaceServer,
          args: ["--version"],
          launchCommand: workspaceServer,
          launchArgs: ["--stdio"],
          startable: true,
        };
      }

      if (fs.existsSync(bundledServer)) {
        return {
          command: process.execPath,
          args: [bundledServer, "--version"],
          launchCommand: process.execPath,
          launchArgs: [bundledServer, "--stdio"],
          env: runBundledServerWithElectronNode,
          startable: true,
        };
      }

      if (fs.existsSync(workspaceTsc)) {
        return {
          command: workspaceTsc,
          args: [],
          launchCommand: workspaceTsc,
          launchArgs: [],
          startable: false,
        };
      }

      return {
        command: "typescript-language-server",
        args: ["--version"],
        launchCommand: "typescript-language-server",
        launchArgs: ["--stdio"],
        startable: true,
      };
    },
  },
  {
    id: "cpp",
    label: "C++",
    languages: ["C", "C++"],
    command: "clangd",
    args: ["--version"],
    launchArgs: ["--background-index"],
    workspaceMarkers: [
      "compile_commands.json",
      "CMakeLists.txt",
      "meson.build",
      "Makefile",
      "*.c",
      "*.cc",
      "*.cpp",
      "*.cxx",
      "*.h",
      "*.hpp",
    ],
    installHint: "Install clangd from Axon's Language Tools when C or C++ is detected.",
    managedBundle: {
      directoryName: "cpp",
      executableNames: ["clangd"],
    },
  },
  {
    id: "go",
    label: "Go",
    languages: ["Go"],
    command: "gopls",
    args: ["version"],
    launchArgs: [],
    workspaceMarkers: ["go.mod", "go.work", "*.go"],
    installHint: "Bundled with Axon through the managed gopls bundle.",
    managedBundle: {
      directoryName: "go",
      executableNames: ["gopls"],
    },
  },
  {
    id: "rust",
    label: "Rust",
    languages: ["Rust"],
    command: "rust-analyzer",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["Cargo.toml"],
    installHint: "Install rust-analyzer from Axon's Language Tools when Rust is detected.",
    managedBundle: {
      directoryName: "rust",
      executableNames: ["rust-analyzer"],
    },
  },
  {
    id: "python",
    label: "Python",
    languages: ["Python"],
    command: "pyright-langserver",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["pyproject.toml", "setup.py", "requirements.txt", "*.py"],
    installHint: "Bundled with Axon through pyright.",
    runtimeRequirement:
      "Select the project virtual environment when imports live outside the system Python.",
    bundledNodeServer: {
      packagePath: ["node_modules", "pyright"],
      scriptPath: ["langserver.index.js"],
    },
  },
  {
    id: "java",
    label: "Java",
    languages: ["Java"],
    command: "jdtls",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: [
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts",
      ".project",
    ],
    installHint: "Install JDT LS and Axon's private Java runtime from Language Tools.",
    managedBundle: {
      directoryName: "java",
      executableNames: ["jdtls"],
    },
  },
  {
    id: "csharp",
    label: "C#",
    languages: ["C#"],
    command: "csharp-ls",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: [
      "*.sln",
      "*.csproj",
      "global.json",
      "Directory.Build.props",
    ],
    installHint: "Install OmniSharp and Axon's private .NET SDK from Language Tools.",
    managedBundle: {
      directoryName: "csharp",
      executableNames: ["OmniSharp", "OmniSharp.exe", "omnisharp"],
      launchArgs: ["--languageserver"],
    },
  },
  {
    id: "kotlin",
    label: "Kotlin",
    languages: ["Kotlin"],
    command: "kotlin-language-server",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: [
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts",
    ],
    installHint: "Install Kotlin support and its shared private Java runtime from Language Tools.",
    managedBundle: {
      directoryName: "kotlin",
      executableNames: ["kotlin-language-server"],
    },
  },
  {
    id: "php",
    label: "PHP",
    languages: ["PHP"],
    command: "intelephense",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["composer.json", "phpunit.xml", "phpunit.xml.dist"],
    installHint: "Bundled with Axon through intelephense.",
    bundledNodeServer: {
      packagePath: ["node_modules", "intelephense"],
      scriptPath: ["lib", "intelephense.js"],
    },
  },
  {
    id: "lua",
    label: "Lua",
    languages: ["Lua"],
    command: "lua-language-server",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: [
      ".luarc.json",
      ".luarc.jsonc",
      "selene.toml",
      "stylua.toml",
    ],
    installHint: "Install Lua Language Server from Axon's Language Tools when Lua is detected.",
    managedBundle: {
      directoryName: "lua",
      executableNames: ["lua-language-server"],
    },
  },
  {
    id: "docker",
    label: "Docker",
    languages: ["Dockerfile", "Docker Compose"],
    command: "docker-langserver",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: [
      "Dockerfile",
      ".dockerignore",
      "docker-compose.yml",
      "docker-compose.yaml",
    ],
    installHint: "Bundled with Axon through dockerfile-language-server-nodejs.",
    resolveCommand: (folderPath) => {
      const workspaceServer = path.join(
        folderPath,
        "node_modules/.bin/docker-langserver",
      );
      const bundledServer = resolveBundledAppFilePath(
        "node_modules/dockerfile-language-server-nodejs/bin/docker-langserver",
      );
      const runBundledServerWithElectronNode = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      };

      if (fs.existsSync(workspaceServer)) {
        return {
          command: workspaceServer,
          args: ["--version"],
          launchCommand: workspaceServer,
          launchArgs: ["--stdio"],
          startable: true,
        };
      }

      if (fs.existsSync(bundledServer)) {
        return {
          command: process.execPath,
          args: [bundledServer, "--version"],
          launchCommand: process.execPath,
          launchArgs: [bundledServer, "--stdio"],
          env: runBundledServerWithElectronNode,
          startable: true,
        };
      }

      return {
        command: "docker-langserver",
        args: ["--version"],
        launchCommand: "docker-langserver",
        launchArgs: ["--stdio"],
        startable: true,
      };
    },
  },
  {
    id: "tailwind",
    label: "Tailwind CSS",
    languages: ["HTML", "CSS", "JSX", "TSX"],
    command: "tailwindcss-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: [
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
      "tailwind.config.ts",
      "postcss.config.js",
      "package.json",
    ],
    installHint: "Bundled with Axon through @tailwindcss/language-server.",
    resolveCommand: (folderPath) => {
      const workspaceServer = path.join(
        folderPath,
        "node_modules/.bin/tailwindcss-language-server",
      );
      const bundledServer = resolveBundledAppFilePath(
        "node_modules/@tailwindcss/language-server/bin/tailwindcss-language-server",
      );
      const runBundledServerWithElectronNode = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      };

      if (fs.existsSync(workspaceServer)) {
        return {
          command: workspaceServer,
          args: ["--version"],
          launchCommand: workspaceServer,
          launchArgs: ["--stdio"],
          startable: true,
        };
      }

      if (fs.existsSync(bundledServer)) {
        return {
          command: process.execPath,
          args: [bundledServer, "--version"],
          launchCommand: process.execPath,
          launchArgs: [bundledServer, "--stdio"],
          env: runBundledServerWithElectronNode,
          startable: true,
        };
      }

      return {
        command: "tailwindcss-language-server",
        args: ["--version"],
        launchCommand: "tailwindcss-language-server",
        launchArgs: ["--stdio"],
        startable: true,
      };
    },
  },
  {
    id: "html",
    label: "HTML",
    languages: ["HTML"],
    command: "vscode-html-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["index.html", "*.html"],
    installHint: "Bundled with Axon through vscode-langservers-extracted.",
    bundledNodeServer: {
      packagePath: ["node_modules", "vscode-langservers-extracted"],
      scriptPath: ["bin", "vscode-html-language-server"],
    },
  },
  {
    id: "css",
    label: "CSS",
    languages: ["CSS", "SCSS", "Less"],
    command: "vscode-css-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["*.css", "*.scss", "*.less"],
    installHint: "Bundled with Axon through vscode-langservers-extracted.",
    bundledNodeServer: {
      packagePath: ["node_modules", "vscode-langservers-extracted"],
      scriptPath: ["bin", "vscode-css-language-server"],
    },
  },
  {
    id: "json",
    label: "JSON",
    languages: ["JSON", "JSONC"],
    command: "vscode-json-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["*.json", "*.jsonc"],
    installHint: "Bundled with Axon through vscode-langservers-extracted.",
    bundledNodeServer: {
      packagePath: ["node_modules", "vscode-langservers-extracted"],
      scriptPath: ["bin", "vscode-json-language-server"],
    },
  },
  {
    id: "yaml",
    label: "YAML",
    languages: ["YAML"],
    command: "yaml-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["*.yml", "*.yaml", ".yamllint"],
    installHint: "Bundled with Axon through yaml-language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "yaml-language-server"],
      scriptPath: ["bin", "yaml-language-server"],
    },
  },
  {
    id: "bash",
    label: "Bash",
    languages: ["Shell Script", "Bash"],
    command: "bash-language-server",
    args: ["--version"],
    launchArgs: ["start"],
    workspaceMarkers: ["*.sh", "*.bash", ".bashrc", ".bash_profile"],
    installHint: "Bundled with Axon through bash-language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "bash-language-server"],
      scriptPath: ["out", "cli.js"],
    },
  },
  {
    id: "svelte",
    label: "Svelte",
    languages: ["Svelte"],
    command: "svelteserver",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["svelte.config.js", "svelte.config.ts", "*.svelte"],
    installHint: "Bundled with Axon through svelte-language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "svelte-language-server"],
      scriptPath: ["bin", "server.js"],
    },
  },
  {
    id: "vue",
    label: "Vue",
    languages: ["Vue"],
    command: "vue-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["vue.config.js", "vue.config.ts", "vite.config.ts", "*.vue"],
    installHint: "Bundled with Axon through @vue/language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "@vue", "language-server"],
      scriptPath: ["bin", "vue-language-server.js"],
    },
  },
  {
    id: "astro",
    label: "Astro",
    languages: ["Astro"],
    command: "astro-ls",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["astro.config.mjs", "astro.config.ts", "*.astro"],
    installHint: "Bundled with Axon through @astrojs/language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "@astrojs", "language-server"],
      scriptPath: ["bin", "nodeServer.js"],
    },
  },
  {
    id: "graphql",
    label: "GraphQL",
    languages: ["GraphQL"],
    command: "graphql-lsp",
    args: ["--version"],
    launchArgs: ["server", "--method=stream"],
    workspaceMarkers: [
      ".graphqlrc",
      ".graphqlrc.json",
      ".graphqlrc.yml",
      ".graphqlrc.yaml",
      "graphql.config.js",
      "graphql.config.ts",
    ],
    installHint: "Bundled with Axon through graphql-language-service-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "graphql-language-service-server"],
      scriptPath: ["dist", "index.js"],
    },
  },
  {
    id: "mdx",
    label: "MDX",
    languages: ["MDX"],
    command: "mdx-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["*.mdx"],
    installHint: "Bundled with Axon through @mdx-js/language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "@mdx-js", "language-server"],
      scriptPath: ["lib", "index.js"],
    },
  },
  {
    id: "prisma",
    label: "Prisma",
    languages: ["Prisma"],
    command: "prisma-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["schema.prisma", "*.prisma"],
    installHint: "Bundled with Axon through @prisma/language-server.",
    bundledNodeServer: {
      packagePath: ["node_modules", "@prisma", "language-server"],
      scriptPath: ["dist", "bin.js"],
    },
  },
  {
    id: "proto",
    label: "Protocol Buffers",
    languages: ["Protocol Buffers"],
    command: "protols",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["*.proto", "buf.yaml", "buf.work.yaml", "protols.toml"],
    installHint: "Install the Axon-managed Protols language server.",
    managedBundle: {
      directoryName: "proto",
      executableNames: ["protols", "protols.exe"],
    },
  },
  {
    id: "xml",
    label: "XML",
    languages: ["XML", "XSD", "XSLT", "DTD", "SVG"],
    command: "lemminx",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["*.xml", "*.xsd", "*.xsl", "*.xslt", "*.dtd"],
    installHint: "Install the Axon-managed LemMinX language server.",
    managedBundle: {
      directoryName: "xml",
      executableNames: ["lemminx", "lemminx.exe"],
    },
  },
  {
    id: "swift",
    label: "Swift",
    languages: ["Swift"],
    command: "sourcekit-lsp",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["Package.swift", "*.xcodeproj", "*.xcworkspace", "*.swift"],
    installHint: "Install a Swift toolchain from Language Tools when Swift is detected.",
    managedBundle: { directoryName: "swift", executableNames: ["sourcekit-lsp", "sourcekit-lsp.exe"] },
  },
  {
    id: "ruby",
    label: "Ruby",
    languages: ["Ruby"],
    command: "ruby-lsp",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["Gemfile", "*.gemspec", ".ruby-version", "*.rb"],
    installHint: "Install Ruby LSP and its private Ruby runtime from Language Tools.",
    managedBundle: { directoryName: "ruby", executableNames: ["ruby-lsp", "ruby-lsp.cmd"] },
  },
  {
    id: "dart",
    label: "Dart",
    languages: ["Dart"],
    command: "dart",
    args: ["--version"],
    launchArgs: ["language-server", "--protocol=lsp"],
    workspaceMarkers: ["pubspec.yaml", "analysis_options.yaml", "*.dart"],
    installHint: "Install the Dart SDK from Language Tools when Dart is detected.",
    managedBundle: { directoryName: "dart", executableNames: ["dart", "dart.exe"], launchArgs: ["language-server", "--protocol=lsp"] },
  },
  {
    id: "sql",
    label: "SQL",
    languages: ["SQL"],
    command: "sqls",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["*.sql", ".sqls.yml", ".sqls.yaml"],
    installHint: "Install SQLS from Language Tools when SQL is detected.",
    managedBundle: { directoryName: "sql", executableNames: ["sqls", "sqls.exe"] },
  },
  {
    id: "toml",
    label: "TOML",
    languages: ["TOML"],
    command: "taplo",
    args: ["--version"],
    launchArgs: ["lsp", "stdio"],
    workspaceMarkers: ["*.toml"],
    installHint: "Install Taplo from Language Tools when TOML is detected.",
    managedBundle: { directoryName: "toml", executableNames: ["taplo", "taplo.exe"], launchArgs: ["lsp", "stdio"] },
  },
  {
    id: "zig",
    label: "Zig",
    languages: ["Zig"],
    command: "zls",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["build.zig", "build.zig.zon", "*.zig", "*.zon"],
    installHint: "Install ZLS from Language Tools when Zig is detected.",
    managedBundle: { directoryName: "zig", executableNames: ["zls", "zls.exe"] },
  },
  {
    id: "terraform",
    label: "Terraform",
    languages: ["Terraform", "HCL"],
    command: "terraform-ls",
    args: ["version"],
    launchArgs: ["serve"],
    workspaceMarkers: ["*.tf", "*.tfvars", "*.hcl", ".terraform.lock.hcl"],
    installHint: "Install Terraform Language Server from Language Tools.",
    managedBundle: { directoryName: "terraform", executableNames: ["terraform-ls", "terraform-ls.exe"], launchArgs: ["serve"] },
  },
  {
    id: "latex",
    label: "LaTeX",
    languages: ["LaTeX", "BibTeX"],
    command: "texlab",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["*.tex", "*.bib", "*.sty", "*.cls", ".latexmkrc"],
    installHint: "Install TexLab from Language Tools when LaTeX is detected.",
    managedBundle: { directoryName: "latex", executableNames: ["texlab", "texlab.exe"] },
  },
  {
    id: "scala",
    label: "Scala",
    languages: ["Scala"],
    command: "metals",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["build.sbt", "build.sc", "project/build.properties", "*.scala"],
    installHint: "Install Metals and Axon's private Java runtime from Language Tools.",
    managedBundle: { directoryName: "scala", executableNames: ["metals", "metals.cmd"] },
  },
  {
    id: "clojure",
    label: "Clojure",
    languages: ["Clojure", "ClojureScript", "EDN"],
    command: "clojure-lsp",
    args: ["version"],
    launchArgs: ["listen"],
    workspaceMarkers: ["deps.edn", "project.clj", "shadow-cljs.edn", "bb.edn", "*.clj", "*.cljs", "*.cljc"],
    installHint: "Install Clojure LSP from Language Tools when Clojure is detected.",
    managedBundle: { directoryName: "clojure", executableNames: ["clojure-lsp", "clojure-lsp.exe"], launchArgs: ["listen"] },
  },
  {
    id: "haskell",
    label: "Haskell",
    languages: ["Haskell"],
    command: "haskell-language-server-wrapper",
    args: ["--version"],
    launchArgs: ["--lsp"],
    workspaceMarkers: ["stack.yaml", "cabal.project", "*.cabal", "*.hs", "*.lhs"],
    installHint: "Install a compatible Haskell Language Server from Language Tools.",
    managedBundle: { directoryName: "haskell", executableNames: ["haskell-language-server-wrapper", "haskell-language-server-wrapper.exe"], launchArgs: ["--lsp"] },
  },
  {
    id: "erlang",
    label: "Erlang",
    languages: ["Erlang"],
    command: "elp",
    args: ["version"],
    launchArgs: ["server"],
    workspaceMarkers: ["rebar.config", "rebar.lock", "erlang.mk", "*.erl", "*.hrl"],
    installHint: "Install Erlang Language Platform from Language Tools.",
    managedBundle: { directoryName: "erlang", executableNames: ["elp", "elp.exe"], launchArgs: ["server"] },
  },
  {
    id: "r",
    label: "R",
    languages: ["R"],
    command: "R",
    args: ["--version"],
    launchArgs: ["--slave", "-e", "languageserver::run()"],
    workspaceMarkers: ["DESCRIPTION", "renv.lock", "*.R", "*.r"],
    installHint: "Install R and its language server from Language Tools.",
  },
  {
    id: "powershell",
    label: "PowerShell",
    languages: ["PowerShell"],
    command: "PowerShellEditorServices",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["*.ps1", "*.psm1", "*.psd1"],
    installHint: "Install PowerShell Editor Services and a private PowerShell runtime from Language Tools.",
    managedBundle: { directoryName: "powershell", executableNames: ["PowerShellEditorServices", "PowerShellEditorServices.cmd"] },
  },
  {
    id: "asm",
    label: "Assembly",
    languages: ["Assembly"],
    command: "asm-lsp",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: [".asm-lsp.toml", "*.asm", "*.s", "*.S"],
    installHint: "Install asm-lsp from Language Tools when Assembly is detected.",
    managedBundle: { directoryName: "asm", executableNames: ["asm-lsp", "asm-lsp.exe"] },
  },
  {
    id: "makefile",
    label: "Makefile",
    languages: ["Makefile", "GNU Make"],
    command: "autotools-language-server",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["Makefile", "GNUmakefile", "BSDmakefile", "*.mk"],
    installHint: "Install autotools-language-server to enable Makefile intelligence.",
  },
];
