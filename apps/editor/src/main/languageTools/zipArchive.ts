import { spawn } from "child_process";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import { open as openZip, type Entry as ZipEntry } from "yauzl";
import {
  isSafeArchiveEntry,
  MAX_TOOL_EXTRACTED_BYTES,
} from "./archiveSafety";

const LARGE_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;
const LARGE_ZIP_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

type ExtractionActivity = (
  processedBytes?: number,
  idleTimeoutMs?: number,
) => void;

function getZipEntryType(entry: ZipEntry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return mode & 0o170000;
}

function isZipDirectory(entry: ZipEntry) {
  return (
    entry.fileName.replace(/\\/g, "/").endsWith("/") ||
    getZipEntryType(entry) === 0o040000
  );
}

function validateZipEntry(
  entry: ZipEntry,
  state: { entryCount: number; extractedBytes: number },
) {
  state.entryCount += 1;
  state.extractedBytes += entry.uncompressedSize;
  if (!isSafeArchiveEntry(entry.fileName)) {
    throw new Error("The language tool ZIP contains an unsafe path.");
  }

  const entryType = getZipEntryType(entry);
  if (![0, 0o040000, 0o100000].includes(entryType)) {
    throw new Error("The language tool ZIP contains an unsafe entry type.");
  }
  if (state.extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
    throw new Error("The language tool ZIP expands beyond the allowed size.");
  }
}

async function validateZipArchive(
  archivePath: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  await new Promise<void>((resolve, reject) => {
    openZip(
      archivePath,
      { lazyEntries: true, autoClose: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(openError ?? new Error("The ZIP archive could not be opened."));
          return;
        }

        const state = { entryCount: 0, extractedBytes: 0 };
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve();
        };
        const abort = () => {
          zipFile.close();
          finish(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException("The operation was aborted.", "AbortError"),
          );
        };

        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          abort();
          return;
        }
        zipFile.on("error", finish);
        zipFile.on("entry", (entry) => {
          try {
            signal.throwIfAborted();
            validateZipEntry(entry, state);
            onActivity();
            zipFile.readEntry();
          } catch (error) {
            zipFile.close();
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        });
        zipFile.on("end", () => {
          if (state.entryCount === 0) {
            finish(new Error("The language tool ZIP is empty."));
            return;
          }
          finish();
        });
        zipFile.readEntry();
      },
    );
  });
}

async function extractZipArchiveWithDitto(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  await validateZipArchive(archivePath, signal, onActivity);
  signal.throwIfAborted();

  // I use macOS's archive extractor after validation because clangd contains
  // a single 170 MB executable. Electron's JavaScript ZIP stream can stop
  // yielding while that file is flushed, which made the normal two-minute
  // inactivity guard reject a healthy install. ditto performs this work in a
  // separate process, while verbose output still gives Axon real progress and
  // keeps cancellation independent from the Electron main thread.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "/usr/bin/ditto",
      [
        "-V",
        "-x",
        "-k",
        "--noqtn",
        "--noextattr",
        "--noacl",
        archivePath,
        destination,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let settled = false;
    let diagnostics = "";
    let abortError: Error | null = null;
    let forceKillTimeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      abortError =
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      if (!child.kill("SIGTERM")) {
        finish(abortError);
        return;
      }

      // Cancellation must also terminate a native extractor that is blocked
      // in the operating system. I wait for the child to close before
      // rejecting so staging cleanup cannot race with a process that is still
      // writing into the same directory, then force termination only if the
      // graceful signal was ignored.
      forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 2_000);
      forceKillTimeout.unref?.();
    };
    const consumeLine = (line: string) => {
      const match = /^(\d+) bytes for /.exec(line);
      onActivity(match ? Number(match[1]) : 0, LARGE_ZIP_IDLE_TIMEOUT_MS);
    };
    const createOutputConsumer = () => {
      let pending = "";
      return {
        push(chunk: Buffer) {
          const output = chunk.toString("utf8");
          diagnostics = `${diagnostics}${output}`.slice(-32 * 1024);
          pending += output;
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() ?? "";
          lines.forEach(consumeLine);
        },
        flush() {
          if (pending) consumeLine(pending);
          pending = "";
        },
      };
    };
    const stdout = createOutputConsumer();
    const stderr = createOutputConsumer();

    signal.addEventListener("abort", abort, { once: true });
    onActivity(0, LARGE_ZIP_IDLE_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish(abortError ?? error));
    child.on("close", (code, closeSignal) => {
      if (settled) return;
      stdout.flush();
      stderr.flush();
      if (abortError) {
        finish(abortError);
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const diagnosticLines = diagnostics.trim().split(/\r?\n/);
      const detail = diagnosticLines[diagnosticLines.length - 1];
      finish(
        new Error(
          detail ||
            `The macOS archive extractor stopped${closeSignal ? ` with ${closeSignal}` : ` with exit code ${code ?? "unknown"}`}.`,
        ),
      );
    });
    if (signal.aborted) abort();
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

async function extractZipArchiveWithNode(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  await new Promise<void>((resolve, reject) => {
    openZip(
      archivePath,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(openError ?? new Error("The ZIP archive could not be opened."));
          return;
        }
        if (signal.aborted) {
          zipFile.close();
          reject(signal.reason);
          return;
        }
        onActivity();

        let settled = false;
        const validationState = { entryCount: 0, extractedBytes: 0 };
        const destinationRoot = path.resolve(destination);
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          zipFile.close();
          if (error) reject(error);
          else resolve();
        };
        const abort = () =>
          finish(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException("The operation was aborted.", "AbortError"),
          );

        signal.addEventListener("abort", abort, { once: true });
        zipFile.on("error", finish);
        zipFile.on("entry", (entry) => {
          void (async () => {
            signal.throwIfAborted();
            onActivity();
            validateZipEntry(entry, validationState);

            const normalizedName = entry.fileName.replace(/\\/g, "/");
            const outputPath = path.resolve(
              destinationRoot,
              ...normalizedName.split("/").filter(Boolean),
            );
            if (
              outputPath !== destinationRoot &&
              !outputPath.startsWith(`${destinationRoot}${path.sep}`)
            ) {
              throw new Error("The language tool ZIP contains an unsafe path.");
            }
            if (isZipDirectory(entry)) {
              await fs.mkdir(outputPath, { recursive: true });
              signal.throwIfAborted();
              zipFile.readEntry();
              return;
            }

            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            signal.throwIfAborted();
            const readStream = await new Promise<Readable>(
              (resolveStream, rejectStream) => {
                zipFile.openReadStream(entry, (streamError, stream) => {
                  if (streamError || !stream) {
                    rejectStream(
                      streamError ??
                        new Error("The ZIP entry could not be opened."),
                    );
                    return;
                  }
                  resolveStream(stream);
                });
              },
            );
            await pipeline(
              readStream,
              createActivityTransform(
                onActivity,
                entry.uncompressedSize >= LARGE_ZIP_ENTRY_BYTES
                  ? LARGE_ZIP_IDLE_TIMEOUT_MS
                  : undefined,
              ),
              createWriteStream(outputPath, { flags: "wx", mode: 0o600 }),
              { signal },
            );
            signal.throwIfAborted();
            zipFile.readEntry();
          })().catch((error) =>
            finish(error instanceof Error ? error : new Error(String(error))),
          );
        });
        zipFile.on("end", () => {
          if (validationState.entryCount === 0) {
            finish(new Error("The language tool ZIP is empty."));
            return;
          }
          finish();
        });
        zipFile.readEntry();
      },
    );
  });
}

export async function extractZipArchive(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
  onActivity: ExtractionActivity,
) {
  signal.throwIfAborted();
  if (process.platform === "darwin") {
    await extractZipArchiveWithDitto(
      archivePath,
      destination,
      signal,
      onActivity,
    );
    return;
  }

  await extractZipArchiveWithNode(
    archivePath,
    destination,
    signal,
    onActivity,
  );
}
