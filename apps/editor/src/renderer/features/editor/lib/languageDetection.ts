export function detectMonacoLanguage(path: string): string {
  const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const extension = path.split(".").pop()?.toLowerCase();

  if (
    fileName === ".env" ||
    fileName === ".envrc" ||
    fileName.startsWith(".env.")
  ) {
    return "shell";
  }
  if (
    fileName === "dockerfile" ||
    fileName.startsWith("dockerfile.")
  ) {
    return "dockerfile";
  }
  if (
    fileName === ".gitignore" ||
    fileName === ".ignore" ||
    fileName.endsWith("ignore")
  ) {
    return "gitignore";
  }
  if (
    fileName === "tsconfig.json" ||
    fileName === "jsconfig.json" ||
    extension === "jsonc"
  ) {
    return "json";
  }
  if (
    fileName === "makefile" ||
    fileName === "gnumakefile" ||
    fileName === "bsdmakefile" ||
    fileName.startsWith("makefile.")
  ) {
    return "makefile";
  }
  if (
    fileName === "gemfile" ||
    fileName === "rakefile" ||
    fileName === "guardfile" ||
    fileName === "podfile" ||
    fileName === "brewfile"
  ) {
    return "ruby";
  }

  const languagesByExtension: Record<string, string> = {
    c: "cpp",
    cc: "cpp",
    cpp: "cpp",
    cxx: "cpp",
    h: "cpp",
    hh: "cpp",
    hpp: "cpp",
    hxx: "cpp",
    cplusplus: "cpp",
    go: "go",
    rs: "rust",
    ts: "typescript",
    tsx: "typescriptreact",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascriptreact",
    py: "python",
    pyi: "python",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    cs: "csharp",
    swift: "swift",
    rb: "ruby",
    rake: "ruby",
    gemspec: "ruby",
    lua: "lua",
    php: "php",
    sql: "sql",
    dart: "dart",
    tf: "terraform",
    tfvars: "terraform",
    hcl: "hcl",
    zig: "zig",
    zon: "zig",
    tex: "latex",
    sty: "latex",
    cls: "latex",
    bib: "bibtex",
    scala: "scala",
    sc: "scala",
    clj: "clojure",
    cljs: "clojure",
    cljc: "clojure",
    edn: "clojure",
    hs: "haskell",
    lhs: "haskell",
    erl: "erlang",
    hrl: "erlang",
    r: "r",
    ps1: "powershell",
    psm1: "powershell",
    psd1: "powershell",
    asm: "asm",
    s: "asm",
    inc: "asm",
    mk: "makefile",
    mak: "makefile",
    make: "makefile",
    xml: "xml",
    xsd: "xml",
    xsl: "xml",
    xslt: "xml",
    dtd: "xml",
    svg: "xml",
    proto: "proto",
    md: "markdown",
    markdown: "markdown",
    json: "json",
    jsonc: "json",
    json5: "json",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    astro: "html",
    html: "html",
    htm: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
  };
  return languagesByExtension[extension ?? ""] ?? "plaintext";
}

export function detectLanguageServerLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx") return "typescriptreact";
  if (extension === "jsx") return "javascriptreact";
  if (extension === "astro") return "astro";
  return detectMonacoLanguage(path);
}
