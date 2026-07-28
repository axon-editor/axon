import { execFile } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { createGunzip } from "zlib";
import { extract as extractTar } from "tar";
import { open as openZip, type Entry as ZipEntry } from "yauzl";

const MAX_TOOL_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export function isSafeArchiveEntry(entry: string) {
  const normalized = entry.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("\0")) return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return false;
  }
  return !normalized.split("/").some((part: string) => part === "..");
}

function isZipSymbolicLink(entry: ZipEntry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

async function extractZipArchive(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    openZip(
      archivePath,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(
            openError ?? new Error("The ZIP archive could not be opened."),
          );
          return;
        }
        if (signal.aborted) {
          zipFile.close();
          reject(signal.reason);
          return;
        }

        let settled = false;
        let entryCount = 0;
        let extractedBytes = 0;
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
            entryCount += 1;
            extractedBytes += entry.uncompressedSize;
            if (!isSafeArchiveEntry(entry.fileName)) {
              throw new Error("The language tool ZIP contains an unsafe path.");
            }
            if (isZipSymbolicLink(entry)) {
              throw new Error(
                "The language tool ZIP contains a symbolic link.",
              );
            }
            if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
              throw new Error(
                "The language tool ZIP expands beyond the allowed size.",
              );
            }

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
            if (normalizedName.endsWith("/")) {
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
          if (entryCount === 0) {
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

async function extractTarArchive(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let entryCount = 0;
  let extractedBytes = 0;
  await pipeline(
    createReadStream(archivePath),
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
) {
  const commandOptions = {
    encoding: "utf8" as const,
    maxBuffer: 16 * 1024 * 1024,
    signal,
  };
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
}

async function extractGzipExecutable(
  archivePath: string,
  assetName: string,
  destination: string,
  signal: AbortSignal,
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
    createWriteStream(path.join(destination, outputName), { mode: 0o600 }),
    { signal },
  );
}

export async function extractLanguageToolArchive(input: {
  archivePath: string;
  assetName: string;
  destination: string;
  signal: AbortSignal;
}) {
  if (input.assetName.endsWith(".zip") || input.assetName.endsWith(".vsix")) {
    await extractZipArchive(input.archivePath, input.destination, input.signal);
  } else if (input.assetName.endsWith(".tar.xz")) {
    await extractXzTarArchive(
      input.archivePath,
      input.destination,
      input.signal,
    );
  } else if (
    input.assetName.endsWith(".gz") &&
    !input.assetName.endsWith(".tar.gz")
  ) {
    await extractGzipExecutable(
      input.archivePath,
      input.assetName,
      input.destination,
      input.signal,
    );
  } else {
    await extractTarArchive(input.archivePath, input.destination, input.signal);
  }
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
