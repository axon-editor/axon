/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  LARGE_DOCUMENT_CHARACTER_THRESHOLD,
  LARGE_DOCUMENT_LINE_THRESHOLD,
  PLAIN_DOCUMENT_LANGUAGE_ID,
  REDUCED_DOCUMENT_CHARACTER_THRESHOLD,
  REDUCED_DOCUMENT_LINE_THRESHOLD,
  UNSAFE_TOKENIZATION_LINE_LENGTH,
  isLargeDocumentContent,
  isLargeDocumentModel,
  isPlainDocumentPath,
  isReducedDocumentContent,
  isReducedDocumentModel,
} from "./largeDocument";

describe("large document policy", () => {
  it("keeps ordinary source files on the full editor feature path", () => {
    expect(isLargeDocumentContent('{"ready": true}\n')).toBe(false);
    expect(
      isLargeDocumentModel({
        getLineCount: () => LARGE_DOCUMENT_LINE_THRESHOLD - 1,
        getValueLength: () => LARGE_DOCUMENT_CHARACTER_THRESHOLD - 1,
      }),
    ).toBe(false);
  });

  it("detects documents by either character or line pressure", () => {
    expect(
      isLargeDocumentContent("x".repeat(LARGE_DOCUMENT_CHARACTER_THRESHOLD)),
    ).toBe(true);
    expect(
      isLargeDocumentContent("\n".repeat(LARGE_DOCUMENT_LINE_THRESHOLD - 1)),
    ).toBe(true);
    expect(
      isLargeDocumentModel({
        getLineCount: () => 2,
        getValueLength: () => LARGE_DOCUMENT_CHARACTER_THRESHOLD,
      }),
    ).toBe(true);
  });

  it("treats a model on the plain language as a large document regardless of size", () => {
    const smallPlainModel = {
      getLanguageId: () => PLAIN_DOCUMENT_LANGUAGE_ID,
      getLineCount: () => 2,
      getValueLength: () => 32,
    };
    expect(isLargeDocumentModel(smallPlainModel)).toBe(true);
  });

  it("does not require test doubles to expose a language id", () => {
    expect(
      isLargeDocumentModel({
        getLineCount: () => 1,
        getValueLength: () => 8,
      }),
    ).toBe(false);
  });
});

describe("reduced document tier", () => {
  it("keeps small files on the richer overlay path", () => {
    expect(isReducedDocumentContent('{"ready": true}\n')).toBe(false);
    expect(
      isReducedDocumentModel({
        getLineCount: () => 10,
        getValueLength: () => 512,
      }),
    ).toBe(false);
  });

  it("promotes documents past the character or line threshold", () => {
    expect(
      isReducedDocumentContent(
        "x".repeat(REDUCED_DOCUMENT_CHARACTER_THRESHOLD),
      ),
    ).toBe(true);
    expect(
      isReducedDocumentContent("\n".repeat(REDUCED_DOCUMENT_LINE_THRESHOLD)),
    ).toBe(true);
    expect(
      isReducedDocumentModel({
        getLineCount: () => 1,
        getValueLength: () => REDUCED_DOCUMENT_CHARACTER_THRESHOLD,
      }),
    ).toBe(true);
    expect(
      isReducedDocumentModel({
        getLineCount: () => REDUCED_DOCUMENT_LINE_THRESHOLD,
        getValueLength: () => 0,
      }),
    ).toBe(true);
  });

  it("promotes a single minified line that stays under the size thresholds", () => {
    const minified = "x".repeat(UNSAFE_TOKENIZATION_LINE_LENGTH) + "\n";
    expect(isReducedDocumentContent(minified)).toBe(true);
    expect(isLargeDocumentContent(minified)).toBe(false);
  });
});

describe("plain document paths", () => {
  it.each([
    "/workspace/package-lock.json",
    "/workspace/nested/app/npm-shrinkwrap.json",
    "C:\\repo\\package-lock.json",
    "/workspace/COMPOSER.LOCK",
    "/workspace/bun.lock",
    "/workspace/flake.lock",
  ])("routes %s into plain mode", (filePath) => {
    expect(isPlainDocumentPath(filePath)).toBe(true);
  });

  it.each([
    "/workspace/package.json",
    "/workspace/my-package-lock.json.bak",
    "/workspace/Cargo.lock",
    "/workspace/yarn.lock",
  ])("keeps %s on the normal path", (filePath) => {
    expect(isPlainDocumentPath(filePath)).toBe(false);
  });
});
