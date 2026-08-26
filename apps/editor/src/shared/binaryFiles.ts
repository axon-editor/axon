export type BinaryFileKind =
  | "archive"
  | "audio"
  | "database"
  | "document"
  | "executable"
  | "font"
  | "spreadsheet";

// Extension classification is an early routing decision, not the security
// detector. It covers established container and binary formats before the
// renderer asks for their contents, while the main-process UTF-8 validator and
// Git's own binary detection remain authoritative for unfamiliar extensions.
// Keeping this table in shared code makes editor tabs, speculative prefetch,
// Source Control, and history agree on which files must bypass Monaco.
const binaryExtensionsByKind: Record<BinaryFileKind, ReadonlySet<string>> = {
  archive: new Set([
    "7z",
    "bz2",
    "deb",
    "gz",
    "iso",
    "jar",
    "rar",
    "rpm",
    "tar",
    "tgz",
    "vsix",
    "war",
    "xz",
    "zip",
  ]),
  audio: new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav"]),
  database: new Set(["accdb", "db", "mdb", "sqlite", "sqlite3"]),
  document: new Set([
    "doc",
    "docx",
    "key",
    "odp",
    "odt",
    "pages",
    "pdf",
    "ppt",
    "pptx",
  ]),
  executable: new Set([
    "a",
    "appimage",
    "bin",
    "class",
    "dll",
    "dmg",
    "dylib",
    "exe",
    "o",
    "pyc",
    "pyo",
    "so",
    "wasm",
  ]),
  font: new Set(["eot", "otf", "ttf", "woff", "woff2"]),
  spreadsheet: new Set(["numbers", "ods", "xls", "xlsx"]),
};

export const binaryFileKindLabels: Record<BinaryFileKind, string> = {
  archive: "archive",
  audio: "audio file",
  database: "database",
  document: "document",
  executable: "binary program",
  font: "font",
  spreadsheet: "spreadsheet",
};

function fileExtension(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === fileName.length - 1) return "";
  return fileName.slice(extensionIndex + 1).toLowerCase();
}

export function getKnownBinaryFileKind(
  filePath: string,
): BinaryFileKind | null {
  const extension = fileExtension(filePath);
  if (!extension) return null;

  for (const [kind, extensions] of Object.entries(binaryExtensionsByKind)) {
    if (extensions.has(extension)) return kind as BinaryFileKind;
  }

  return null;
}

export function isKnownBinaryFile(filePath: string) {
  return getKnownBinaryFileKind(filePath) !== null;
}
