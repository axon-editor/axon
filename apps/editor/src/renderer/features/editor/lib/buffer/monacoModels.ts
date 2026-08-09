import * as monaco from "monaco-editor";
import { registerMonacoReactLanguages } from "../language/monacoReactLanguages";
import { registerMonacoStructuredLanguages } from "../language/monacoStructuredLanguages";
import { registerMonacoAdditionalLanguages } from "../language/monacoAdditionalLanguages";
import { detectMonacoLanguage } from "../language/languageDetection";
import {
  LARGE_DOCUMENT_LANGUAGE_ID,
  registerMonacoLargeDocumentLanguages,
} from "../language/monacoLargeDocumentLanguages";
import {
  isLargeDocumentContent,
  isLargeDocumentModel,
} from "@axon-editor/shared/largeDocument";

// Axon Buffer Engine owns document identity and lifecycle while Monaco remains
// the proven text engine and renderer. Keeping those responsibilities separate
// gives Axon fast path-keyed reuse without replacing editing, undo, selection,
// or language integrations that already behave correctly.

export {
  detectLanguageServerLanguage,
  detectMonacoLanguage,
} from "../language/languageDetection";

export interface AxonBufferMetadata {
  external: boolean;
  readOnly: boolean;
}

interface AxonBufferEntry {
  dirty: boolean;
  lastAccessed: number;
  memoryBytes: number;
  metadata: AxonBufferMetadata;
  model: monaco.editor.ITextModel;
  references: number;
}

const RETAINED_BUFFER_BUDGET = 64 * 1024 * 1024;
const RETAINED_BUFFER_LIMIT = 48;
const RETAINED_SINGLE_BUFFER_LIMIT = 32 * 1024 * 1024;
const buffers = new Map<string, AxonBufferEntry>();
const disposalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const modelListeners = new Map<
  string,
  Set<(model: monaco.editor.ITextModel) => void>
>();
let accessClock = 0;

export function detectLanguage(path: string): string {
  return detectMonacoLanguage(path);
}

export function refreshModelLanguage(
  filePath: string,
  model: monaco.editor.ITextModel,
) {
  const detectedLanguage = detectLanguage(filePath);
  const modelLanguage = isLargeDocumentModel(model)
    ? LARGE_DOCUMENT_LANGUAGE_ID
    : detectedLanguage;
  if (model.getLanguageId() !== modelLanguage) {
    monaco.editor.setModelLanguage(model, modelLanguage);
  }
  return modelLanguage;
}

function registerLanguages() {
  registerMonacoReactLanguages();
  registerMonacoStructuredLanguages();
  registerMonacoAdditionalLanguages();
  registerMonacoLargeDocumentLanguages();
}

function estimateModelMemory(model: monaco.editor.ITextModel) {
  return Math.max(1, model.getValueLength() * 2);
}

function touch(entry: AxonBufferEntry) {
  entry.lastAccessed = ++accessClock;
}

function cancelDisposal(filePath: string) {
  const timer = disposalTimers.get(filePath);
  if (!timer) return;
  clearTimeout(timer);
  disposalTimers.delete(filePath);
}

function disposeBuffer(filePath: string, expected: AxonBufferEntry) {
  if (buffers.get(filePath) !== expected || expected.references > 0) return;
  cancelDisposal(filePath);
  if (!expected.model.isDisposed()) expected.model.dispose();
  buffers.delete(filePath);
}

function scheduleDisposal(filePath: string, entry: AxonBufferEntry) {
  cancelDisposal(filePath);
  const timer = setTimeout(() => {
    disposalTimers.delete(filePath);
    disposeBuffer(filePath, entry);
  }, 500);
  disposalTimers.set(filePath, timer);
}

function trimRetainedBuffers() {
  const retained = [...buffers.entries()]
    .filter(([, entry]) => entry.references === 0 && !entry.dirty)
    .sort((left, right) => left[1].lastAccessed - right[1].lastAccessed);
  let retainedBytes = retained.reduce(
    (total, [, entry]) => total + entry.memoryBytes,
    0,
  );
  let retainedCount = retained.length;

  for (const [filePath, entry] of retained) {
    if (
      retainedBytes <= RETAINED_BUFFER_BUDGET &&
      retainedCount <= RETAINED_BUFFER_LIMIT
    ) {
      break;
    }
    retainedBytes -= entry.memoryBytes;
    retainedCount--;
    disposeBuffer(filePath, entry);
  }
}

function createBuffer(
  filePath: string,
  content: string,
  references: number,
  metadata: AxonBufferMetadata = { external: false, readOnly: false },
) {
  registerLanguages();
  const language = isLargeDocumentContent(content)
    ? LARGE_DOCUMENT_LANGUAGE_ID
    : detectLanguage(filePath);
  const uri = monaco.Uri.file(filePath);
  const model =
    monaco.editor.getModel(uri) ??
    monaco.editor.createModel(content, language, uri);
  refreshModelLanguage(filePath, model);
  const entry: AxonBufferEntry = {
    dirty: false,
    lastAccessed: ++accessClock,
    memoryBytes: estimateModelMemory(model),
    metadata,
    model,
    references,
  };
  buffers.set(filePath, entry);
  notifyModelReady(filePath, model);
  return entry;
}

// Acquiring an existing buffer is synchronous. This is the fast reopen path:
// React can attach Monaco to the retained model during mount while disk metadata
// is revalidated in the background, so users do not see a temporary one-line
// document between selecting a file and seeing its text.
export function acquireExistingModel(filePath: string) {
  const entry = buffers.get(filePath);
  if (!entry || entry.model.isDisposed()) return undefined;
  cancelDisposal(filePath);
  entry.references++;
  touch(entry);
  refreshModelLanguage(filePath, entry.model);
  return entry.model;
}

export function acquireModel(filePath: string, content: string) {
  const existing = acquireExistingModel(filePath);
  if (existing) return existing;
  return createBuffer(filePath, content, 1).model;
}

export function primeModel(
  filePath: string,
  content: string,
  metadata: AxonBufferMetadata,
) {
  const existing = getModel(filePath);
  if (existing) return existing;

  // Prefetch owns no editor reference. The model stays eligible for immediate
  // LRU eviction, which prevents a quick mouse sweep over the file tree from
  // retaining an unbounded number of decoded files.
  const entry = createBuffer(filePath, content, 0, metadata);
  if (entry.memoryBytes > RETAINED_SINGLE_BUFFER_LIMIT) {
    scheduleDisposal(filePath, entry);
  } else {
    trimRetainedBuffers();
  }
  return entry.model;
}

export function releaseModel(filePath: string) {
  const entry = buffers.get(filePath);
  if (!entry || entry.references <= 0) return;
  entry.references--;
  touch(entry);
  entry.memoryBytes = estimateModelMemory(entry.model);
  if (entry.references > 0) return;

  // Unsaved models and very large models are not reusable cache entries. The
  // short delayed disposal remains important for split-pane races, but clean
  // normal-sized models now survive tab closure until the bounded LRU needs the
  // memory, which makes common close/reopen workflows effectively immediate.
  if (entry.dirty || entry.memoryBytes > RETAINED_SINGLE_BUFFER_LIMIT) {
    scheduleDisposal(filePath, entry);
    return;
  }
  trimRetainedBuffers();
}

export function markModelDirty(filePath: string, dirty: boolean) {
  const entry = buffers.get(filePath);
  if (!entry) return;
  entry.dirty = dirty;
  entry.memoryBytes = estimateModelMemory(entry.model);
  touch(entry);
  if (!dirty && entry.references === 0) trimRetainedBuffers();
}

export function isModelMarkedDirty(filePath: string) {
  return buffers.get(filePath)?.dirty ?? false;
}

export function setModelMetadata(
  filePath: string,
  metadata: AxonBufferMetadata,
) {
  const entry = buffers.get(filePath);
  if (entry) entry.metadata = metadata;
}

export function getModelMetadata(filePath: string) {
  return buffers.get(filePath)?.metadata;
}

export function updateModel(filePath: string, content: string) {
  const entry = buffers.get(filePath);
  if (!entry || entry.model.isDisposed()) return;
  if (entry.model.getValue() !== content) entry.model.setValue(content);
  entry.memoryBytes = estimateModelMemory(entry.model);
  touch(entry);
  refreshModelLanguage(filePath, entry.model);
}

export function getModel(filePath: string) {
  const entry = buffers.get(filePath);
  if (!entry || entry.model.isDisposed()) return undefined;
  touch(entry);
  return entry.model;
}

export function onModelReady(
  filePath: string,
  listener: (model: monaco.editor.ITextModel) => void,
) {
  const existing = getModel(filePath);
  if (existing) listener(existing);

  let listeners = modelListeners.get(filePath);
  if (!listeners) {
    listeners = new Set();
    modelListeners.set(filePath, listeners);
  }
  listeners.add(listener);

  return {
    dispose() {
      listeners?.delete(listener);
      if (listeners?.size === 0) modelListeners.delete(filePath);
    },
  };
}

function notifyModelReady(filePath: string, model: monaco.editor.ITextModel) {
  const listeners = modelListeners.get(filePath);
  if (!listeners) return;
  for (const listener of listeners) listener(model);
}
