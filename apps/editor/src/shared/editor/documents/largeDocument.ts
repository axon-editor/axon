/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const LARGE_DOCUMENT_CHARACTER_THRESHOLD = 2 * 1024 * 1024;
export const LARGE_DOCUMENT_LINE_THRESHOLD = 20_000;
export const LARGE_DOCUMENT_FIND_MATCH_LIMIT = 5_000;

// Reduced tier mirrors how VS Code and Zed degrade: neither runs a
// whole-document enrichment pass on medium-large files. VS Code turns semantic
// highlighting off for large files and caps tokenization per line; Zed
// disables tree-sitter highlighting for large files and disables LSP for files
// with very long lines. Axon's equivalent cost is the Shiki whole-file pass
// plus the whole-document decoration stream, so files past these thresholds
// keep Monaco's native lazy coloring and LSP but skip that overlay.
export const REDUCED_DOCUMENT_CHARACTER_THRESHOLD = 256 * 1024;
export const REDUCED_DOCUMENT_LINE_THRESHOLD = 5_000;
// Mirrors Monaco's own maxTokenizationLineLength default. A minified bundle is
// one enormous line that stays under the character threshold's line count, so
// line length has its own guard or single-line files slip into the full
// pipeline and freeze the overlay.
export const UNSAFE_TOKENIZATION_LINE_LENGTH = 20_000;

// Canonical id for the plain/large-document Monarch language. It lives here
// instead of the renderer registration so document policy and the buffer
// engine share one string and cannot drift apart.
export const PLAIN_DOCUMENT_LANGUAGE_ID = "axon-large-document";

// Lockfiles are machine-generated JSON dumps. They routinely sit under the
// hard size tier while still carrying the full enrichment cost profile, and
// no schema validation, formatting, or semantic coloring is ever useful on a
// dependency graph. Filename detection is deterministic where size thresholds
// are heuristic, so these skip straight to plain mode regardless of size.
// Non-JSON lockfiles (yarn.lock, Cargo.lock, pnpm-lock.yaml) are deliberately
// absent: they never enter the JSON enrichment pipeline this protects.
const PLAIN_DOCUMENT_FILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "bun.lock",
  "composer.lock",
  "pipfile.lock",
  "deno.lock",
  "flake.lock",
]);

interface MeasurableTextModel {
  getLineCount(): number;
  getValueLength(): number;
  // Optional so hand-rolled test doubles keep working; real Monaco models
  // always expose it. The plain-language check below depends on it.
  getLanguageId?(): string;
}

export function isPlainDocumentPath(path: string) {
  const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  return PLAIN_DOCUMENT_FILE_NAMES.has(fileName);
}

export function isLargeDocumentContent(content: string) {
  if (content.length >= LARGE_DOCUMENT_CHARACTER_THRESHOLD) return true;

  // A generated file can contain hundreds of thousands of very short lines
  // without crossing the character threshold. I stop counting as soon as the
  // policy threshold is reached, so detection itself never performs the full
  // split and allocation that large-file mode exists to avoid.
  let lineCount = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 10) continue;
    lineCount += 1;
    if (lineCount >= LARGE_DOCUMENT_LINE_THRESHOLD) return true;
  }
  return false;
}

export function isLargeDocumentModel(model: MeasurableTextModel) {
  // The plain language covers lockfiles and any other path-routed document
  // that is small in bytes but already opted out of language services. Every
  // hard-tier guard consults this one function, so checking the language here
  // keeps lockfile buffers out of the overlay, LSP sync, and mirroring paths
  // without editing each call site.
  if (model.getLanguageId?.() === PLAIN_DOCUMENT_LANGUAGE_ID) return true;
  return (
    model.getValueLength() >= LARGE_DOCUMENT_CHARACTER_THRESHOLD ||
    model.getLineCount() >= LARGE_DOCUMENT_LINE_THRESHOLD
  );
}

// One early-exit pass counts characters, newlines, and the longest run since
// the last newline. No split, no allocation: detection itself stays cheap even
// for the multi-megabyte files it is meant to catch.
export function isReducedDocumentContent(content: string) {
  if (content.length >= REDUCED_DOCUMENT_CHARACTER_THRESHOLD) return true;

  let lineCount = 1;
  let lineLength = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 10) {
      lineCount += 1;
      lineLength = 0;
      if (lineCount >= REDUCED_DOCUMENT_LINE_THRESHOLD) return true;
      continue;
    }
    lineLength += 1;
    if (lineLength >= UNSAFE_TOKENIZATION_LINE_LENGTH) return true;
  }
  return false;
}

// The model variant checks sizes only. Scanning line lengths would need a full
// content copy per call, and long-line files are almost always over the
// character threshold anyway; the content scan at load time covers the rest.
export function isReducedDocumentModel(model: MeasurableTextModel) {
  return (
    model.getValueLength() >= REDUCED_DOCUMENT_CHARACTER_THRESHOLD ||
    model.getLineCount() >= REDUCED_DOCUMENT_LINE_THRESHOLD
  );
}
