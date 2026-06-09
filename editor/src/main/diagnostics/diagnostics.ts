import { app } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { type EditorDiagnostic } from "../../shared/diagnostics";

const execFileAsync = promisify(execFile);

function createDiagnosticId(diagnostic: Omit<EditorDiagnostic, "id">) {
  return `${diagnostic.source ?? "project"}:${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`;
}

function makeDiagnostic(
  diagnostic: Omit<EditorDiagnostic, "id">,
): EditorDiagnostic {
  return {
    ...diagnostic,
    id: createDiagnosticId(diagnostic),
  };
}

function parseTypeScriptDiagnostics(
  folderPath: string,
  output: string,
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];
  const diagnosticPattern =
    /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

  for (const line of output.split(/\r?\n/)) {
    const match = diagnosticPattern.exec(line.trim());
    if (!match) continue;

    const [, filePath, lineNumber, columnNumber, level, code, message] = match;
    diagnostics.push(
      makeDiagnostic({
        path: path.resolve(folderPath, filePath),
        line: Number(lineNumber),
        column: Number(columnNumber),
        severity: level === "warning" ? "warning" : "error",
        message,
        source: `tsc ${code}`,
      }),
    );
  }

  return diagnostics;
}

function parseGoDiagnostics(
  folderPath: string,
  output: string,
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];
  const diagnosticPattern = /^(.+?\.go):(\d+):(\d+):\s+(.+)$/;

  for (const line of output.split(/\r?\n/)) {
    const match = diagnosticPattern.exec(line.trim());
    if (!match) continue;

    const [, filePath, lineNumber, columnNumber, message] = match;
    diagnostics.push(
      makeDiagnostic({
        path: path.resolve(folderPath, filePath),
        line: Number(lineNumber),
        column: Number(columnNumber),
        severity: "error",
        message,
        source: "go test",
      }),
    );
  }

  return diagnostics;
}

export async function runProjectDiagnostics(
  folderPath: string,
): Promise<EditorDiagnostic[]> {
  const diagnostics: EditorDiagnostic[] = [];

  // This is the first project-aware diagnostics bridge. Monaco can only check
  // the model it has in memory, so imports, tsconfig options, and package-level
  // Go compile errors are easy to miss. These runners ask the project's own
  // toolchain for errors and keep the output normalized to the same Problems
  // panel shape that a long-lived LSP client can use later.
  if (fs.existsSync(path.join(folderPath, "tsconfig.json"))) {
    const workspaceTsc = path.join(
      folderPath,
      "node_modules/typescript/lib/tsc.js",
    );
    const bundledTsc = path.join(
      app.getAppPath(),
      "node_modules/typescript/lib/tsc.js",
    );
    const tscPath = fs.existsSync(workspaceTsc) ? workspaceTsc : bundledTsc;

    if (fs.existsSync(tscPath)) {
      try {
        await execFileAsync(
          "node",
          [tscPath, "--noEmit", "--pretty", "false"],
          {
            cwd: folderPath,
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 8,
          },
        );
      } catch (err) {
        const output = `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}`;
        diagnostics.push(...parseTypeScriptDiagnostics(folderPath, output));
      }
    }
  }

  if (fs.existsSync(path.join(folderPath, "go.mod"))) {
    try {
      await execFileAsync("go", ["test", "-run", "^$", "./..."], {
        cwd: folderPath,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 8,
      });
    } catch (err) {
      const output = `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}`;
      diagnostics.push(...parseGoDiagnostics(folderPath, output));
    }
  }

  return diagnostics;
}
