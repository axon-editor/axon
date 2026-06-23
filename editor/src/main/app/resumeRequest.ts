import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type AgentResumeRequest } from "../../shared/app";

const resumeRequestPath = path.join(os.homedir(), ".axon", "agent-resume.json");

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

export async function writePendingAgentResumeRequest(
  request: AgentResumeRequest,
) {
  await writeJsonFile(resumeRequestPath, request);
}

export async function consumePendingAgentResumeRequest() {
  const request = await readJsonFile<AgentResumeRequest>(resumeRequestPath);
  if (!request) return null;
  await fs.rm(resumeRequestPath, { force: true });
  return request;
}
