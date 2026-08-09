import {
  readFile,
  type FileContent,
} from "@axon-editor/renderer/shared/lib/api";
import { getModel, primeModel } from "./monacoModels";

const inFlightLoads = new Map<string, Promise<FileContent>>();

export function loadAxonBuffer(filePath: string, folderPath?: string | null) {
  const pending = inFlightLoads.get(filePath);
  if (pending) return pending;

  const request = readFile(filePath, folderPath ?? undefined).finally(() => {
    if (inFlightLoads.get(filePath) === request) {
      inFlightLoads.delete(filePath);
    }
  });
  inFlightLoads.set(filePath, request);
  return request;
}

export async function prefetchAxonBuffer(
  filePath: string,
  folderPath?: string | null,
) {
  if (getModel(filePath)) return;
  try {
    const file = await loadAxonBuffer(filePath, folderPath);
    primeModel(filePath, file.content, {
      external: file.external,
      readOnly: file.readOnly,
    });
  } catch {
    // Hover prefetch is speculative. The normal open path reports useful file,
    // permission, encoding, and binary errors if the user actually selects it;
    // surfacing those errors merely because the pointer crossed a row would be
    // noisy and would make browsing the tree feel broken.
  }
}
