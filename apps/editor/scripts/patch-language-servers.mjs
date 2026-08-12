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

function readPackageMajor(packagePath) {
  if (!fs.existsSync(packagePath)) return null;

  const manifest = JSON.parse(
    fs.readFileSync(path.join(packagePath, "package.json"), "utf8"),
  );
  return Number.parseInt(manifest.version.split(".", 1)[0], 10);
}

function ensureYamlDraftAjvPeer() {
  const draftPackagePath = path.join(
    workspaceRoot,
    "node_modules",
    "ajv-draft-04",
  );
  if (!fs.existsSync(draftPackagePath)) return;

  const localPeerPath = path.join(draftPackagePath, "node_modules", "ajv");
  if (readPackageMajor(localPeerPath) === 8) return;

  const sourceCandidates = [
    path.join(
      editorRoot,
      "node_modules",
      "yaml-language-server",
      "node_modules",
      "ajv",
    ),
    path.join(
      workspaceRoot,
      "node_modules",
      "yaml-language-server",
      "node_modules",
      "ajv",
    ),
    path.join(editorRoot, "node_modules", "ajv"),
    path.join(workspaceRoot, "node_modules", "ajv"),
  ];
  const sourcePath = sourceCandidates.find(
    (candidate) => readPackageMajor(candidate) === 8,
  );
  if (!sourcePath) return;

  // ajv-draft-04 declares AJV 8 as an optional peer. npm can still hoist the
  // peer beside AJV 6 when build tools need the older major, which makes Node
  // load an API that ajv-draft-04 cannot use. I place YAML LS's own AJV 8 next
  // to the peer so normal Node resolution is deterministic in development and
  // in the packaged app, without replacing AJV 6 for ESLint or Electron Builder.
  fs.rmSync(localPeerPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(localPeerPath), { recursive: true });
  fs.cpSync(sourcePath, localPeerPath, { recursive: true });
  console.log("patched ajv-draft-04 peer resolution to AJV 8");
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
ensureYamlDraftAjvPeer();
