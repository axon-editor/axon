import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTypeScriptExternalProjectsRequest,
  discoverTypeScriptProjectConfigs,
} from "./typescriptProjects";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axon-ts-projects-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("TypeScript project discovery", () => {
  it("finds nested monorepo configs without scanning dependencies", async () => {
    const workspace = createWorkspace();
    const appDirectory = path.join(workspace, "apps", "web");
    const packageDirectory = path.join(workspace, "packages", "ui");
    const dependencyDirectory = path.join(workspace, "node_modules", "ignored");
    fs.mkdirSync(appDirectory, { recursive: true });
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.mkdirSync(dependencyDirectory, { recursive: true });
    fs.writeFileSync(path.join(appDirectory, "tsconfig.app.json"), "{}");
    fs.writeFileSync(path.join(packageDirectory, "jsconfig.json"), "{}");
    fs.writeFileSync(path.join(dependencyDirectory, "tsconfig.json"), "{}");

    await expect(discoverTypeScriptProjectConfigs(workspace)).resolves.toEqual([
      path.join(appDirectory, "tsconfig.app.json"),
      path.join(packageDirectory, "jsconfig.json"),
    ]);
  });

  it("registers discovered configs without creating project files", async () => {
    const workspace = createWorkspace();
    const sourceDirectory = path.join(workspace, "packages", "ui", "src");
    const configPath = path.join(workspace, "apps", "web", "tsconfig.json");
    const sourcePath = path.join(sourceDirectory, "Button.tsx");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, "export const Button = () => null;");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          baseUrl: ".",
          paths: { "@ui/*": ["../../packages/ui/src/*"] },
        },
        include: ["../../packages/ui/src/**/*"],
      }),
    );
    const request = await createTypeScriptExternalProjectsRequest([configPath]);

    expect(request.command).toBe("typescript.tsserverRequest");
    expect(request.arguments[0]).toBe("openExternalProjects");
    expect(request.arguments[1]).toMatchObject({
      projects: [
        {
          projectFileName: `${configPath}.axon-external-project`,
          rootFiles: [{ fileName: sourcePath }],
          options: {
            baseUrl: path.dirname(configPath),
            paths: { "@ui/*": ["../../packages/ui/src/*"] },
          },
        },
      ],
    });
  });

  it("leaves ordinary ancestor projects to tsserver's native discovery", async () => {
    const workspace = createWorkspace();
    const sourceDirectory = path.join(workspace, "src");
    const configPath = path.join(workspace, "tsconfig.json");
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, "index.ts"), "export {};\n");
    fs.writeFileSync(configPath, JSON.stringify({ include: ["src/**/*"] }));

    const request = await createTypeScriptExternalProjectsRequest([configPath]);

    expect(request.arguments[1]).toEqual({ projects: [] });
  });
});
