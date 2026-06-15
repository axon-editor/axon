import fs from "fs";
import path from "path";

const editorRoot = process.cwd();
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
