import fs from "fs";
import path from "path";

const editorRoot = process.cwd();
const workspaceRoot = path.resolve(editorRoot, "..", "..");
const vscodeUriBridgePath = path.join(
  editorRoot,
  "node_modules",
  "vscode-markdown-languageservice",
  "out",
  "util",
  "vscodeUri.js",
);

const brokenVscodeUriBridge = [
  "import uri from 'vscode-uri';",
  "export const URI = uri.URI;",
  "export const Utils = uri.Utils;",
].join("\n");

const fixedVscodeUriBridge = [
  "import { URI, Utils } from 'vscode-uri';",
  "export { URI, Utils };",
].join("\n");

function replaceNestedDependency(targetSegments, securePackageName) {
  const appSourcePath = path.join(editorRoot, "node_modules", securePackageName);
  const workspaceSourcePath = path.join(
    workspaceRoot,
    "node_modules",
    securePackageName,
  );
  const sourcePath = fs.existsSync(appSourcePath)
    ? appSourcePath
    : workspaceSourcePath;
  const targetPath = path.join(workspaceRoot, "node_modules", ...targetSegments);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) return;

  const sourceManifest = JSON.parse(
    fs.readFileSync(path.join(sourcePath, "package.json"), "utf8"),
  );
  const targetManifest = JSON.parse(
    fs.readFileSync(path.join(targetPath, "package.json"), "utf8"),
  );
  if (sourceManifest.version === targetManifest.version) return;

  // Several managed language servers pin exact vulnerable transitive versions,
  // so npm cannot deduplicate them even though the patched releases preserve the
  // APIs those servers consume. Axon copies the reviewed secure package into the
  // nested resolution location before dev/build. That keeps Node's normal module
  // lookup unchanged and avoids downgrading Monaco, Bash LS, or Intelephense just
  // to make npm audit choose an older dependency graph.
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  console.log(
    `patched ${securePackageName} ${targetManifest.version} -> ${sourceManifest.version}`,
  );
}

if (fs.existsSync(vscodeUriBridgePath)) {
  const current = fs.readFileSync(vscodeUriBridgePath, "utf8");

  // I patch this dependency before build because the MDX language server loads
  // vscode-markdown-languageservice through Electron's Node runtime in packaged
  // Axon. That package imports vscode-uri as a default ESM export, but
  // vscode-uri only exposes named ESM exports in the version we ship. Without
  // this small compatibility patch, MDX works in some dev paths and then fails
  // only after packaging with a syntax-level module error.
  if (current.includes(brokenVscodeUriBridge)) {
    fs.writeFileSync(
      vscodeUriBridgePath,
      current.replace(brokenVscodeUriBridge, fixedVscodeUriBridge),
    );
    console.log("patched vscode-markdown-languageservice vscode-uri import");
  }
}

replaceNestedDependency(
  ["editorconfig", "node_modules", "minimatch"],
  "minimatch",
);
replaceNestedDependency(
  ["editorconfig", "node_modules", "brace-expansion"],
  "brace-expansion",
);
replaceNestedDependency(
  ["editorconfig", "node_modules", "balanced-match"],
  "balanced-match",
);
replaceNestedDependency(["protobufjs"], "protobufjs");
replaceNestedDependency(["dompurify"], "dompurify");
