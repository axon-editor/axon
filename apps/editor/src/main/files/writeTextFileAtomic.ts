/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const DEFAULT_FILE_MODE = 0o644;
const FILE_MODE_MASK = 0o7777;
const WINDOWS_REPLACE_RETRY_CODES = new Set(["EACCES", "EEXIST", "EPERM"]);

async function existingFileMode(filePath: string) {
  try {
    const info = await fs.promises.stat(filePath);
    if (!info.isFile()) throw new Error("Path is not a file.");
    return info.mode & FILE_MODE_MASK;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function replaceFile(temporaryPath: string, filePath: string) {
  try {
    await fs.promises.rename(temporaryPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (
      process.platform !== "win32" ||
      !code ||
      !WINDOWS_REPLACE_RETRY_CODES.has(code)
    ) {
      throw error;
    }

    // Windows can reject a rename over an existing file while a scanner or
    // another editor holds the destination. Deleting only the destination and
    // retrying keeps saves working there; POSIX never takes this path, so its
    // normal replacement stays atomic.
    await fs.promises.rm(filePath, { force: true });
    await fs.promises.rename(temporaryPath, filePath);
  }
}

// Agent and editor saves both replace a file that another window, watcher, or
// language server may be reading. Writing beside the destination and renaming
// means readers see either the old bytes or the complete new bytes, never the
// half-written body a direct writeFile can expose.
export async function writeTextFileAtomic(filePath: string, content: string) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.axon-write-${process.pid}-${randomUUID()}.tmp`,
  );
  const mode = (await existingFileMode(filePath)) ?? DEFAULT_FILE_MODE;
  let handle: fs.promises.FileHandle | undefined;

  try {
    handle = await fs.promises.open(temporaryPath, "wx", mode);
    await handle.writeFile(content, "utf8");
    // Reapply the exact mode because the process umask can clear bits from the
    // open() mode, then flush bytes and metadata before the rename so a crash
    // cannot make the destination point at a partial temporary file.
    await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await replaceFile(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
