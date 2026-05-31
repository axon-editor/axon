// src/renderer/lib/fileIcons.tsx
// Maps file extensions and special filenames to catppuccin latte SVG icons.
// Icons served as static imports via Vite ?url suffix.
// getFolderIcon maps folder names to specific folder icons with open/closed variants.
// Falls back to _file.svg and _folder.svg for unmapped entries.

function SvgIcon({ src, size = 16 }: { src: string; size?: number }) {
  return (
    <img
      src={src}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
      }}
      alt=""
    />
  );
}

const base = "/icons/";

const extensionMap: Record<string, string> = {
  go: "go.svg",
  ts: "typescript.svg",
  tsx: "typescript-react.svg",
  js: "javascript.svg",
  jsx: "javascript-react.svg",
  py: "python.svg",
  rs: "rust.svg",
  cpp: "cpp.svg",
  cc: "cpp.svg",
  h: "cpp-header.svg",
  hpp: "cpp-header.svg",
  c: "cpp.svg",
  cs: "csharp.svg",
  java: "java.svg",
  rb: "ruby.svg",
  php: "php.svg",
  swift: "swift.svg",
  kt: "kotlin.svg",
  html: "html.svg",
  htm: "html.svg",
  css: "css.svg",
  scss: "sass.svg",
  sass: "sass.svg",
  json: "json.svg",
  xml: "xml.svg",
  svg: "_file.svg",
  yaml: "yaml.svg",
  yml: "yaml.svg",
  toml: "toml.svg",
  env: "env.svg",
  md: "markdown.svg",
  txt: "text.svg",
  pdf: "pdf.svg",
  sh: "bash.svg",
  bash: "bash.svg",
  zsh: "bash.svg",
  csv: "csv.svg",
  sql: "_file.svg",
  mod: "go.svg",
  sum: "go.svg",
  lock: "npm-lock.svg",
};

const specialFilenameMap: Record<string, string> = {
  dockerfile: "docker.svg",
  "docker-compose.yml": "docker-compose.svg",
  "docker-compose.yaml": "docker-compose.svg",
  ".env": "env.svg",
  ".gitignore": "git.svg",
  ".gitattributes": "git.svg",
  ".gitmodules": "git.svg",
  "package.json": "package-json.svg",
  "package-lock.json": "npm-lock.svg",
  "go.mod": "go.svg",
  "go.sum": "go.svg",
  "tsconfig.json": "typescript.svg",
  "jsconfig.json": "javascript.svg",
};

const folderMap: Record<string, string> = {
  src: "folder_src",
  source: "folder_src",
  components: "folder_components",
  config: "folder_config",
  configs: "folder_config",
  dist: "folder_dist",
  build: "folder_dist",
  docs: "folder_docs",
  documentation: "folder_docs",
  ".git": "folder_git",
  ".github": "folder_github",
  api: "folder_api",
  apis: "folder_api",
  assets: "folder_assets",
  static: "folder_assets",
  lib: "folder_lib",
  libs: "folder_lib",
  utils: "folder_utils",
  helpers: "folder_utils",
  hooks: "folder_hooks",
  types: "folder_types",
  typings: "folder_types",
  test: "folder_tests",
  tests: "folder_tests",
  __tests__: "folder_tests",
  spec: "folder_tests",
  public: "folder_public",
  server: "folder_server",
  routes: "folder_routes",
  route: "folder_routes",
  middleware: "folder_middleware",
  middlewares: "folder_middleware",
  scripts: "folder_scripts",
  styles: "folder_styles",
  css: "folder_styles",
  docker: "folder_docker",
  database: "folder_database",
  db: "folder_database",
  node_modules: "folder_node",
  core: "folder_core",
  shared: "folder_shared",
  common: "folder_shared",
  functions: "folder_functions",
  fn: "folder_functions",
  views: "folder_views",
  pages: "folder_views",
  layouts: "folder_layouts",
  layout: "folder_layouts",
  packages: "folder_packages",
  pkgs: "folder_packages",
  tmp: "folder_temp",
  temp: "folder_temp",
  ".tmp": "folder_temp",
};

export function getFileIcon(filename: string, size = 16) {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  if (specialFilenameMap[lower]) {
    return <SvgIcon src={`${base}${specialFilenameMap[lower]}`} size={size} />;
  }
  if (extensionMap[ext]) {
    return <SvgIcon src={`${base}${extensionMap[ext]}`} size={size} />;
  }
  return <SvgIcon src={`${base}_file.svg`} size={size} />;
}

export function getFolderIcon(name: string, expanded: boolean, size = 16) {
  const lower = name.toLowerCase();
  const base_name = folderMap[lower];

  if (base_name) {
    const icon = expanded ? `${base_name}_open.svg` : `${base_name}.svg`;
    return <SvgIcon src={`${base}${icon}`} size={size} />;
  }

  return (
    <SvgIcon
      src={`${base}${expanded ? "_folder_open.svg" : "_folder.svg"}`}
      size={size}
    />
  );
}
