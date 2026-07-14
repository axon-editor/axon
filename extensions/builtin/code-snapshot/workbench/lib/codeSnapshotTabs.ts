export const CODE_SNAPSHOT_TAB_PREFIX = "axon-code-snapshot:";
export const AXON_OPEN_CODE_SNAPSHOT_EVENT = "axon:openCodeSnapshot";

export interface CodeSnapshotSource {
  content: string;
  endLine: number;
  filePath: string;
  languageId: string;
  startLine: number;
}

const snapshotSources = new Map<string, CodeSnapshotSource>();

export function createCodeSnapshotTabPath(source: CodeSnapshotSource) {
  const tabPath = `${CODE_SNAPSHOT_TAB_PREFIX}${crypto.randomUUID()}`;
  snapshotSources.set(tabPath, source);
  return tabPath;
}

export function isCodeSnapshotTabPath(tabPath: string) {
  return tabPath.startsWith(CODE_SNAPSHOT_TAB_PREFIX);
}

export function getCodeSnapshotSource(tabPath: string) {
  return snapshotSources.get(tabPath) ?? null;
}

export function requestCodeSnapshot(source: CodeSnapshotSource) {
  const tabPath = createCodeSnapshotTabPath(source);
  window.dispatchEvent(
    new CustomEvent(AXON_OPEN_CODE_SNAPSHOT_EVENT, {
      detail: { tabPath },
    }),
  );
}
