import { execFile } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { createGunzip } from "zlib";
import extractZip from "extract-zip";
import { extract as extractTar, list as listTar } from "tar";
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

async function validateZipArchive(archivePath: string, signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    openZip(archivePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error("The ZIP archive could not be opened."));
        return;
      }

      let entryCount = 0;
      let extractedBytes = 0;
      const abort = () => fail(signal.reason);
      const fail = (error: Error) => {
        signal.removeEventListener("abort", abort);
        zipFile.close();
        reject(error);
      };

      signal.addEventListener("abort", abort, { once: true });
      zipFile.on("error", fail);
      zipFile.on("entry", (entry) => {
        if (signal.aborted) {
          fail(signal.reason);
          return;
        }
        entryCount += 1;
        extractedBytes += entry.uncompressedSize;
        if (!isSafeArchiveEntry(entry.fileName)) {
          fail(new Error("The language tool ZIP contains an unsafe path."));
          return;
        }
        if (isZipSymbolicLink(entry)) {
          fail(new Error("The language tool ZIP contains a symbolic link."));
          return;
        }
        if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
          fail(
            new Error("The language tool ZIP expands beyond the allowed size."),
          );
          return;
        }
        zipFile.readEntry();
      });
      zipFile.on("end", () => {
        signal.removeEventListener("abort", abort);
        if (entryCount === 0) {
          fail(new Error("The language tool ZIP is empty."));
          return;
        }
        resolve();
      });
      zipFile.readEntry();
    });
  });
}

async function extractZipArchive(
  archivePath: string,
  destination: string,
  signal: AbortSignal,
) {
  await validateZipArchive(archivePath, signal);
  signal.throwIfAborted();
  await extractZip(archivePath, {
    dir: destination,
    onEntry: (entry) => {
      signal.throwIfAborted();
      if (!isSafeArchiveEntry(entry.fileName) || isZipSymbolicLink(entry)) {
        throw new Error("The language tool ZIP changed after validation.");
      }
    },
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
    listTar({
      strict: true,
      onReadEntry: (entry) => {
        signal.throwIfAborted();
        if (entry.meta) return;
        entryCount += 1;
        extractedBytes += entry.size;
        if (!isSafeArchiveEntry(entry.path)) {
          throw new Error("The language tool TAR contains an unsafe path.");
        }
        if (!["File", "OldFile", "Directory"].includes(entry.type)) {
          throw new Error(`The language tool TAR contains ${entry.type}.`);
        }
        if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
          throw new Error(
            "The language tool TAR expands beyond the allowed size.",
          );
        }
      },
    }),
    { signal },
  );
  if (entryCount === 0) throw new Error("The language tool TAR is empty.");

  await pipeline(
    createReadStream(archivePath),
    extractTar({
      cwd: destination,
      strict: true,
      preservePaths: false,
      unlink: true,
      filter: (entryPath, entry) =>
        !signal.aborted &&
        isSafeArchiveEntry(entryPath) &&
        ("type" in entry
          ? ["File", "OldFile", "Directory"].includes(entry.type)
          : false),
    }),
    { signal },
  );
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
