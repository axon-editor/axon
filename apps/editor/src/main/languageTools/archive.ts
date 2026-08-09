import { execFile } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { createGunzip } from "zlib";
import { extract as extractTar } from "tar";
import { runWithActivityWatchdog } from "./activityWatchdog";
import {
  isSafeArchiveEntry,
  MAX_TOOL_EXTRACTED_BYTES,
} from "./archiveSafety";
import { extractZipArchive } from "./zipArchive";

const EXTRACTION_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const execFileAsync = promisify(execFile);

type ExtractionActivity = (
  processedBytes?: number,
  idleTimeoutMs?: number,
) => void;

export { isSafeArchiveEntry } from "./archiveSafety";

async function extractTarArchive(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  signal.throwIfAborted();
  let entryCount = 0;
  let extractedBytes = 0;
  await pipeline(
    createReadStream(archivePath),
    createActivityTransform(onActivity),
    extractTar({
      cwd: destination,
      strict: true,
      preservePaths: false,
      unlink: true,
      filter: (entryPath, entry) => {
        signal.throwIfAborted();
        if ("meta" in entry && entry.meta) return false;
        entryCount += 1;
        extractedBytes += entry.size;
        if (!isSafeArchiveEntry(entryPath)) {
          throw new Error("The language tool TAR contains an unsafe path.");
        }
        const entryType = "type" in entry ? entry.type : "unknown entry type";
        if (!["File", "OldFile", "Directory"].includes(entryType)) {
          throw new Error(`The language tool TAR contains ${entryType}.`);
        }
        if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
          throw new Error(
            "The language tool TAR expands beyond the allowed size.",
          );
        }
        return true;
      },
    }),
    { signal },
  );
  if (entryCount === 0) throw new Error("The language tool TAR is empty.");
}

async function extractXzTarArchive(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  const commandOptions = {
    encoding: "utf8" as const,
    maxBuffer: 16 * 1024 * 1024,
    signal,
  };
  onActivity();
  const [{ stdout: names }, { stdout: verboseEntries }] = await Promise.all([
    execFileAsync("tar", ["-tJf", archivePath], commandOptions),
    execFileAsync("tar", ["-tvJf", archivePath], commandOptions),
  ]);
  const entries = names.split(/\r?\n/).filter(Boolean);
  const entryTypes = verboseEntries.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0 || entries.length !== entryTypes.length) {
    throw new Error("The XZ language tool archive could not be validated.");
  }
  if (entries.some((entry) => !isSafeArchiveEntry(entry))) {
    throw new Error("The language tool XZ archive contains an unsafe path.");
  }
  if (
    entryTypes.some((entry) => !entry.startsWith("-") && !entry.startsWith("d"))
  ) {
    throw new Error(
      "The language tool XZ archive contains an unsafe entry type.",
    );
  }
  await execFileAsync(
    "tar",
    ["-xJf", archivePath, "-C", destination, "--no-same-owner"],
    commandOptions,
  );
  onActivity();
}

async function extractGzipExecutable(
  archivePath: string,
  assetName: string,
  destination: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  signal.throwIfAborted();
  const outputName = path.basename(assetName, ".gz");
  if (!isSafeArchiveEntry(outputName)) {
    throw new Error("The compressed language tool has an unsafe name.");
  }

  let extractedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      extractedBytes += chunk.length;
      if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
        callback(
          new Error("The language tool expands beyond the allowed size."),
        );
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    createReadStream(archivePath),
    createGunzip(),
    sizeGuard,
    createActivityTransform(onActivity),
    createWriteStream(path.join(destination, outputName), { mode: 0o600 }),
    { signal },
  );
}

export async function extractLanguageToolArchive(input: {
  archivePath: string;
  assetName: string;
  destination: string;
  signal: AbortSignal;
  onProgress?: (processedBytes: number) => void;
  idleTimeoutMs?: number;
}) {
  let processedBytes = 0;
  let lastProgressPublishedAt = 0;
  await runWithActivityWatchdog({
    signal: input.signal,
    idleTimeoutMs: input.idleTimeoutMs ?? EXTRACTION_IDLE_TIMEOUT_MS,
    timeoutMessage:
      "Language tool extraction stopped because the archive made no progress within the allowed time.",
    operation: async (extractionSignal, markActivity) => {
      const onActivity = (chunkBytes = 0, idleTimeoutMs?: number) => {
        markActivity(idleTimeoutMs);
        processedBytes += chunkBytes;
        const now = Date.now();
        if (input.onProgress && now - lastProgressPublishedAt >= 100) {
          lastProgressPublishedAt = now;
          input.onProgress(processedBytes);
        }
      };

      if (
        input.assetName.endsWith(".zip") ||
        input.assetName.endsWith(".vsix")
      ) {
        await extractZipArchive(
          input.archivePath,
          input.destination,
          extractionSignal,
          onActivity,
        );
      } else if (input.assetName.endsWith(".tar.xz")) {
        await extractXzTarArchive(
          input.archivePath,
          input.destination,
          extractionSignal,
          onActivity,
        );
      } else if (
        input.assetName.endsWith(".gz") &&
        !input.assetName.endsWith(".tar.gz")
      ) {
        await extractGzipExecutable(
          input.archivePath,
          input.assetName,
          input.destination,
          extractionSignal,
          onActivity,
        );
      } else {
        await extractTarArchive(
          input.archivePath,
          input.destination,
          extractionSignal,
          onActivity,
        );
      }
    },
  });
}

function createActivityTransform(
  onActivity: ExtractionActivity,
  idleTimeoutMs?: number,
) {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onActivity(chunk.length, idleTimeoutMs);
      callback(null, chunk);
    },
  });
}

export async function findExecutable(
  directory: string,
  executableNames: string[],
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted();
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    signal.throwIfAborted();
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("The downloaded language tool contains a symbolic link.");
    }
    if (entry.isDirectory()) {
      const nested = await findExecutable(entryPath, executableNames, signal);
      if (nested) return nested;
    } else if (entry.isFile() && executableNames.includes(entry.name)) {
      return entryPath;
    }
  }
  return null;
}
