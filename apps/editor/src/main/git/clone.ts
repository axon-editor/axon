import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  type GitCloneProgress,
  type GitCloneProgressPhase,
  type GitCloneResult,
} from "../../shared/git";
import { getDeveloperToolSpawnEnvironment } from "../process/environment";

const SUPPORTED_GIT_CLONE_PROTOCOLS = new Set([
  "git:",
  "http:",
  "https:",
  "ssh:",
]);

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function stripAnsiColorCodes(value: string) {
  const escape = String.fromCharCode(27);
  return value
    .split(escape)
    .map((part, index) =>
      index === 0 ? part : part.replace(/^\[[0-9;]*m/, ""),
    )
    .join("");
}

export function parseGitCloneProgressLine(
  rawLine: string,
): GitCloneProgress | null {
  const line = stripAnsiColorCodes(rawLine).trim();
  if (!line) return null;

  const progressMatch =
    /^(Receiving objects|Resolving deltas|Updating files|Checking out files):\s+(\d+)%/i.exec(
      line,
    );
  if (progressMatch) {
    const operation = progressMatch[1].toLowerCase();
    const phase: GitCloneProgressPhase = operation.startsWith("receiving")
      ? "receiving"
      : operation.startsWith("resolving")
        ? "resolving"
        : "checkout";
    const label =
      phase === "receiving"
        ? "Receiving objects"
        : phase === "resolving"
          ? "Resolving deltas"
          : "Checking out files";
    return {
      phase,
      percent: Math.min(100, Math.max(0, Number(progressMatch[2]))),
      message: label,
    };
  }

  const normalized = line.replace(/^remote:\s*/i, "");
  if (/^Counting objects:/i.test(normalized)) {
    return { phase: "counting", percent: null, message: "Counting objects" };
  }
  if (/^Compressing objects:/i.test(normalized)) {
    return {
      phase: "compressing",
      percent: null,
      message: "Compressing objects",
    };
  }
  if (/^Cloning into /i.test(normalized)) {
    return { phase: "starting", percent: 0, message: "Starting clone" };
  }
  return null;
}

async function runGitClone(
  repositoryUrl: string,
  folderPath: string,
  parentPath: string,
  onProgress?: (progress: GitCloneProgress) => void,
) {
  const env = await getDeveloperToolSpawnEnvironment();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      ["clone", "--progress", "--", repositoryUrl, folderPath],
      {
        cwd: parentPath,
        env: {
          ...env,
          // Clone runs behind a modal without an attached terminal. Disabling
          // terminal prompts prevents private or invalid repositories from
          // leaving Axon stuck behind an invisible username/password request;
          // configured Git credential helpers and SSH agents still work.
          GIT_TERMINAL_PROMPT: "0",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    let progressBuffer = "";
    let settled = false;
    let lastProgressKey = "";

    const emitProgressLine = (line: string) => {
      const progress = parseGitCloneProgressLine(line);
      if (!progress) return;
      const key = `${progress.phase}:${progress.percent ?? ""}`;
      if (key === lastProgressKey) return;
      lastProgressKey = key;
      onProgress?.(progress);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (progressBuffer.trim()) emitProgressLine(progressBuffer);
      if (error) reject(error);
      else resolve();
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("Git clone timed out after 10 minutes."));
    }, 10 * 60 * 1000);

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = `${stderr}${text}`.slice(-16 * 1024);
      progressBuffer += text;
      const lines = progressBuffer.split(/[\r\n]+/);
      progressBuffer = lines.pop() ?? "";
      for (const line of lines) emitProgressLine(line);
    });
    child.on("error", (err) => finish(err));
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      if (exitCode === 0) {
        finish();
        return;
      }

      const detail = stripAnsiColorCodes(stderr).trim();
      const fallback = signal
        ? `Git clone stopped with ${signal}.`
        : `Git clone exited with code ${exitCode ?? "unknown"}.`;
      finish(new Error(detail || fallback));
    });
  });
}

export function validateGitCloneRepositoryUrl(repositoryUrl: unknown) {
  if (typeof repositoryUrl !== "string") {
    return { ok: false as const, message: "Enter a valid repository URL." };
  }
  const value = repositoryUrl.trim();
  if (!value || value.length > 4096 || containsControlCharacter(value)) {
    return { ok: false as const, message: "Enter a valid repository URL." };
  }
  if (value.startsWith("-")) {
    return {
      ok: false as const,
      message: "Repository URLs cannot start with an option.",
    };
  }
  if (/^[a-z][a-z0-9+.-]*::/i.test(value)) {
    return {
      ok: false as const,
      message: "Git remote-helper URLs are not supported by the clone dialog.",
    };
  }

  let repositoryPath = "";
  if (value.includes("://")) {
    try {
      const parsed = new URL(value);
      if (
        !SUPPORTED_GIT_CLONE_PROTOCOLS.has(parsed.protocol) ||
        !parsed.hostname
      ) {
        return {
          ok: false as const,
          message: "Use an HTTPS, SSH, HTTP, or Git repository URL.",
        };
      }
      if (
        parsed.password ||
        ((parsed.protocol === "http:" || parsed.protocol === "https:") &&
          parsed.username)
      ) {
        return {
          ok: false as const,
          message:
            "Use the Git credential helper instead of putting a password or token in the URL.",
        };
      }
      repositoryPath = parsed.pathname;
    } catch {
      return {
        ok: false as const,
        message:
          "Use a complete repository URL such as https://github.com/owner/project.git.",
      };
    }
  } else {
    const scpStyleMatch = /^(?:[a-z0-9][a-z0-9._-]*@)?[a-z0-9][a-z0-9.-]*:([^:]+)$/i.exec(value);
    if (!scpStyleMatch) {
      return {
        ok: false as const,
        message:
          "Use a complete repository URL such as https://github.com/owner/project.git.",
      };
    }
    repositoryPath = scpStyleMatch[1] ?? "";
  }

  const encodedName = repositoryPath
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/i, "");
  let name = encodedName ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    return {
      ok: false as const,
      message: "The repository name is not valid.",
    };
  }

  if (
    !name ||
    name === "." ||
    name === ".." ||
    name === ".git" ||
    /[<>:"/\\|?*]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name) ||
    containsControlCharacter(name)
  ) {
    return {
      ok: false as const,
      message: "The repository URL has an invalid project name.",
    };
  }

  return { ok: true as const, value, name };
}

export async function cloneGitRepository(
  repositoryUrl: string,
  destinationParent: string,
  onProgress?: (progress: GitCloneProgress) => void,
): Promise<GitCloneResult> {
  const validated = validateGitCloneRepositoryUrl(repositoryUrl);
  if (!validated.ok) {
    return {
      ok: false,
      canceled: false,
      message: validated.message,
      folderPath: null,
    };
  }

  let parentPath: string;
  try {
    parentPath = await fs.promises.realpath(destinationParent);
    const parentInfo = await fs.promises.stat(parentPath);
    if (!parentInfo.isDirectory()) throw new Error("Destination is not a folder.");
  } catch {
    return {
      ok: false,
      canceled: false,
      message: "The selected clone destination is no longer available.",
      folderPath: null,
    };
  }

  const folderPath = path.join(parentPath, validated.name);
  if (fs.existsSync(folderPath)) {
    return {
      ok: false,
      canceled: false,
      message: `A file or folder named ${validated.name} already exists in that location.`,
      folderPath: null,
    };
  }

  try {
    await runGitClone(validated.value, folderPath, parentPath, onProgress);
    return {
      ok: true,
      canceled: false,
      message: `Cloned ${validated.name}.`,
      folderPath,
    };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
      ? stripAnsiColorCodes((err as { stderr: string }).stderr).trim()
      : undefined;
    const message =
      stderr || (err instanceof Error ? err.message : "Git clone failed.");
    return {
      ok: false,
      canceled: false,
      message:
        message.length > 4000 ? message.slice(message.length - 4000) : message,
      folderPath: null,
    };
  }
}
