// Maps file extensions and special filenames to their SVG icons.
// Icons are bundled locally as static assets so there are no CDN
// dependencies or package version conflicts.
// Vite handles SVG imports as URLs via the ?url suffix.
import cSvg from "../assets/icons/c.svg?url";
import cppSvg from "../assets/icons/cpp.svg?url";
import csharpSvg from "../assets/icons/csharp.svg?url";
import cssSvg from "../assets/icons/css.svg?url";
import csvSvg from "../assets/icons/csv.svg?url";
import databaseSvg from "../assets/icons/database.svg?url";
import dockerfileSvg from "../assets/icons/dockerfile.svg?url";
import envSvg from "../assets/icons/env.svg?url";
import fileSvg from "../assets/icons/file.svg?url";
import folderSvg from "../assets/icons/folder.svg?url";
import folderOpenSvg from "../assets/icons/folder-open.svg?url";
import folderComponentsSvg from "../assets/icons/folder-components.svg?url";
import folderSrcSvg from "../assets/icons/folder-src.svg?url";
import gitSvg from "../assets/icons/git.svg?url";
import goSvg from "../assets/icons/go.svg?url";
import goModSvg from "../assets/icons/go-mod.svg?url";
import htmlSvg from "../assets/icons/html.svg?url";
import javaSvg from "../assets/icons/java.svg?url";
import javascriptSvg from "../assets/icons/javascript.svg?url";
import jsonSvg from "../assets/icons/json.svg?url";
import kotlinSvg from "../assets/icons/kotlin.svg?url";
import lockSvg from "../assets/icons/lock.svg?url";
import markdownSvg from "../assets/icons/markdown.svg?url";
import npmSvg from "../assets/icons/npm.svg?url";
import pdfSvg from "../assets/icons/pdf.svg?url";
import phpSvg from "../assets/icons/php.svg?url";
import pythonSvg from "../assets/icons/python.svg?url";
import reactSvg from "../assets/icons/react.svg?url";
import rubySvg from "../assets/icons/ruby.svg?url";
import rustSvg from "../assets/icons/rust.svg?url";
import sassSvg from "../assets/icons/sass.svg?url";
import shellSvg from "../assets/icons/shell.svg?url";
import svgSvg from "../assets/icons/svg.svg?url";
import swiftSvg from "../assets/icons/swift.svg?url";
import textSvg from "../assets/icons/text.svg?url";
import tomlSvg from "../assets/icons/toml.svg?url";
import typescriptSvg from "../assets/icons/typescript.svg?url";
import xmlSvg from "../assets/icons/xml.svg?url";
import yamlSvg from "../assets/icons/yaml.svg?url";

// SvgIcon renders a local SVG asset as an img tag with consistent sizing.
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

// extensionMap maps file extensions to their SVG asset paths.
const extensionMap: Record<string, string> = {
  go: goSvg,
  ts: typescriptSvg,
  tsx: reactSvg,
  js: javascriptSvg,
  jsx: reactSvg,
  py: pythonSvg,
  rs: rustSvg,
  cpp: cppSvg,
  cc: cppSvg,
  c: cSvg,
  cs: csharpSvg,
  java: javaSvg,
  rb: rubySvg,
  php: phpSvg,
  swift: swiftSvg,
  kt: kotlinSvg,
  html: htmlSvg,
  htm: htmlSvg,
  css: cssSvg,
  scss: sassSvg,
  sass: sassSvg,
  json: jsonSvg,
  xml: xmlSvg,
  svg: svgSvg,
  yaml: yamlSvg,
  yml: yamlSvg,
  toml: tomlSvg,
  env: envSvg,
  md: markdownSvg,
  txt: textSvg,
  pdf: pdfSvg,
  sh: shellSvg,
  bash: shellSvg,
  zsh: shellSvg,
  csv: csvSvg,
  sql: databaseSvg,
  sum: goModSvg,
  mod: goModSvg,
  lock: lockSvg,
  dockerfile: dockerfileSvg,
};

// specialFilenameMap maps exact filenames to their SVG asset paths.
// Takes priority over extension matching for files like Dockerfile,
// .gitignore, package.json etc that have specific icons.
const specialFilenameMap: Record<string, string> = {
  dockerfile: dockerfileSvg,
  "docker-compose.yml": dockerfileSvg,
  "docker-compose.yaml": dockerfileSvg,
  ".env": envSvg,
  ".gitignore": gitSvg,
  ".gitattributes": gitSvg,
  "package.json": npmSvg,
  "package-lock.json": npmSvg,
  "go.mod": goModSvg,
  "go.sum": goModSvg,
};

export function getFileIcon(filename: string, size = 16) {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  // check special filename first — takes priority over extension
  if (specialFilenameMap[lower]) {
    return <SvgIcon src={specialFilenameMap[lower]} size={size} />;
  }

  if (extensionMap[ext]) {
    return <SvgIcon src={extensionMap[ext]} size={size} />;
  }

  return <SvgIcon src={fileSvg} size={size} />;
}

// getFolderIcon returns the folder icon based on expanded state and folder name.
// Named folders like src and components get their own specific icons.
export function getFolderIcon(name: string, expanded: boolean, size = 16) {
  const lower = name.toLowerCase();

  if (lower === "src" || lower === "source") {
    return <SvgIcon src={folderSrcSvg} size={size} />;
  }
  if (lower === "components") {
    return <SvgIcon src={folderComponentsSvg} size={size} />;
  }

  return <SvgIcon src={expanded ? folderOpenSvg : folderSvg} size={size} />;
}
