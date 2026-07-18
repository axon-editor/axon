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
    fileName.startsWith("dockerfile.") ||
    fileName === ".dockerignore"
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
    lua: "lua",
    php: "php",
    sql: "sql",
    dart: "dart",
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
