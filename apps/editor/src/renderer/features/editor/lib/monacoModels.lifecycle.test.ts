import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeModel {
  content: string;
  disposed: boolean;
  language: string;
  dispose: () => void;
  getLanguageId: () => string;
  getLineCount: () => number;
  getValue: () => string;
  getValueLength: () => number;
  isDisposed: () => boolean;
  setValue: (content: string) => void;
}

const { modelsByUri } = vi.hoisted(() => ({
  modelsByUri: new Map<string, FakeModel>(),
}));

vi.mock("monaco-editor", () => ({
  Uri: {
    file: (filePath: string) => ({
      toString: () => `file://${filePath}`,
    }),
  },
  editor: {
    createModel: (
      content: string,
      language: string,
      uri: { toString: () => string },
    ) => {
      const key = uri.toString();
      const model: FakeModel = {
        content,
        disposed: false,
        language,
        dispose() {
          this.disposed = true;
          modelsByUri.delete(key);
        },
        getLanguageId() {
          return this.language;
        },
        getLineCount() {
          return this.content.split("\n").length;
        },
        getValue() {
          return this.content;
        },
        getValueLength() {
          return this.content.length;
        },
        isDisposed() {
          return this.disposed;
        },
        setValue(nextContent: string) {
          this.content = nextContent;
        },
      };
      modelsByUri.set(key, model);
      return model;
    },
    getModel: (uri: { toString: () => string }) =>
      modelsByUri.get(uri.toString()),
    setModelLanguage: (model: FakeModel, language: string) => {
      model.language = language;
    },
  },
}));

vi.mock("./monacoReactLanguages", () => ({
  registerMonacoReactLanguages: vi.fn(),
}));
vi.mock("./monacoStructuredLanguages", () => ({
  registerMonacoStructuredLanguages: vi.fn(),
}));
vi.mock("./monacoAdditionalLanguages", () => ({
  registerMonacoAdditionalLanguages: vi.fn(),
}));
vi.mock("./monacoLargeDocumentLanguages", () => ({
  LARGE_DOCUMENT_LANGUAGE_ID: "axon-large-document",
  registerMonacoLargeDocumentLanguages: vi.fn(),
}));

import {
  acquireExistingModel,
  acquireModel,
  getModel,
  markModelDirty,
  releaseModel,
} from "./monacoModels";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("Axon Buffer Engine model lifecycle", () => {
  it("retains and synchronously reacquires a clean closed buffer", () => {
    const filePath = "/workspace/reopen.ts";
    const first = acquireModel(filePath, "export const value = 1;\n");
    releaseModel(filePath);

    expect(getModel(filePath)).toBe(first);
    expect(acquireExistingModel(filePath)).toBe(first);
    releaseModel(filePath);
  });

  it("disposes an unreferenced dirty buffer after the split-race delay", () => {
    const filePath = "/workspace/discarded.ts";
    const model = acquireModel(
      filePath,
      "const dirty = true;\n",
    ) as unknown as FakeModel;
    markModelDirty(filePath, true);
    releaseModel(filePath);

    vi.advanceTimersByTime(499);
    expect(model.disposed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(model.disposed).toBe(true);
    expect(getModel(filePath)).toBeUndefined();
  });

  it("never disposes a shared model while another pane references it", () => {
    const filePath = "/workspace/split.ts";
    const first = acquireModel(
      filePath,
      "const split = true;\n",
    ) as unknown as FakeModel;
    const second = acquireModel(filePath, "ignored disk content");
    markModelDirty(filePath, true);

    releaseModel(filePath);
    vi.advanceTimersByTime(500);
    expect(second).toBe(first);
    expect(first.disposed).toBe(false);

    releaseModel(filePath);
    vi.advanceTimersByTime(500);
    expect(first.disposed).toBe(true);
  });
});
