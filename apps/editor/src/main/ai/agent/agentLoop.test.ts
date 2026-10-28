/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
  type AiModelMessage,
  type AiModelToolCall,
} from "../../../shared/ai/ai";
import { runAgentLoop } from "./agentLoop";
import { getToolDefinitions, runTool, streamPlanTurn } from "./coreClient";
import { startCoreAiStream } from "../streaming/coreStream";
import { proposeUiTool } from "./uiToolBridge";
import { type AgentCommandController } from "./agentCommandController";

vi.mock("./coreClient", () => ({
  getToolDefinitions: vi.fn(),
  runTool: vi.fn(),
  streamPlanTurn: vi.fn(),
}));

vi.mock("../streaming/coreStream", () => ({
  cancelCoreAiStream: vi.fn(),
  startCoreAiStream: vi.fn(),
}));

vi.mock("./uiToolBridge", () => ({
  proposeUiTool: vi.fn(),
  rejectUiToolsForRequest: vi.fn(),
}));

const request: AiChatRequest = {
  action: "agent",
  prompt: "hello",
  folderPath: "/workspace",
  activeFilePath: null,
  files: [],
  diagnostics: [],
  gitChanges: [],
  conversation: [],
};

const baseMessages = [
  { role: "system" as const, content: "system prompt" },
  { role: "user" as const, content: "hello" },
];

function collectRun(
  input: {
    writeTextFile?: (filePath: string, content: string) => Promise<string>;
    createDirectory?: (directoryPath: string) => Promise<string>;
    commandController?: AgentCommandController;
  } = {},
) {
  const events: AiChatStreamEvent[] = [];
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { requestId } = runAgentLoop({
    axonCorePort: "17777",
    axonCoreToken: "test-token",
    request,
    writeTextFile: input.writeTextFile,
    createDirectory: input.createDirectory,
    commandController: input.commandController,
    send: (event) => {
      events.push(event);
      if (event.type === "done") finish();
    },
  });
  return { events, finished, requestId };
}

function queuePlanTurn(turn: {
  content: string;
  thinking?: string;
  toolCalls?: AiModelToolCall[];
  messages?: AiModelMessage[];
}) {
  vi.mocked(streamPlanTurn).mockImplementationOnce(
    async (_core, _request, _signal, onThought) => {
      if (turn.thinking) onThought(turn.thinking);
      return {
        messages: _request.messages?.length
          ? _request.messages
          : (turn.messages ?? baseMessages),
        message: {
          role: "assistant",
          content: turn.content,
          tool_calls: turn.toolCalls,
        },
      };
    },
  );
}

function commandController(
  overrides: Partial<AgentCommandController> = {},
): AgentCommandController {
  return {
    mode: "ask",
    prepare: vi.fn(async ({ command, cwd }) => ({
      command: command.trim(),
      cwd: cwd ? `/workspace/${cwd}` : "/workspace",
    })),
    isAllowed: vi.fn(() => false),
    allow: vi.fn(),
    run: vi.fn(async () => ({
      ok: true,
      message: "Finished.",
      result: "Command finished successfully.\n\nhello",
    })),
    ...overrides,
  };
}

describe("runAgentLoop", () => {
  beforeEach(() => {
    vi.mocked(getToolDefinitions).mockResolvedValue([]);
    vi.mocked(streamPlanTurn).mockReset();
    vi.mocked(startCoreAiStream).mockReset();
    vi.mocked(proposeUiTool).mockReset();
  });

  it("uses the planning answer instead of generating it a second time", async () => {
    queuePlanTurn({ content: "Hi there" });

    const { events, finished, requestId } = collectRun();
    await finished;

    expect(events).toContainEqual({
      requestId,
      type: "delta",
      delta: "Hi there",
    });
    expect(events[events.length - 1]).toEqual({
      requestId,
      type: "done",
      done: true,
    });
    expect(startCoreAiStream).not.toHaveBeenCalled();
  });

  it("streams the final planning reasoning before the answer", async () => {
    queuePlanTurn({
      content: "Hi there",
      thinking: "The user greeted me, so I should greet them back.",
    });

    const { events, finished } = collectRun();
    await finished;

    const thoughtIndex = events.findIndex(
      (event) =>
        event.type === "thought" &&
        event.thought === "The user greeted me, so I should greet them back.",
    );
    const deltaIndex = events.findIndex(
      (event) => event.type === "delta" && event.delta === "Hi there",
    );
    expect(thoughtIndex).toBeGreaterThan(-1);
    expect(deltaIndex).toBeGreaterThan(thoughtIndex);
  });

  it("orders planning text, tool statuses, and the final answer by event time", async () => {
    vi.mocked(getToolDefinitions).mockResolvedValue([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: {},
        },
      },
    ]);
    queuePlanTurn({
      content: "I'll open the README first.",
      thinking: "The README probably documents the project.",
      toolCalls: [
        {
          function: {
            name: "read_file",
            arguments: { path: "README.md" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The README is short." });
    vi.mocked(runTool).mockResolvedValue("# Axon");

    const { events, finished } = collectRun();
    await finished;

    const ordered = events.map((event) => {
      if (event.type === "thought") return `thought:${event.thought}`;
      if (event.type === "delta") return `delta:${event.delta}`;
      if (event.type === "status") return `status:${event.status}`;
      if (event.type === "tool-started") {
        return `tool-started:${event.tool?.name}`;
      }
      if (event.type === "tool-result") {
        return `tool-result:${event.tool?.name}`;
      }
      return event.type;
    });

    expect(ordered).toEqual([
      "status:Thinking...",
      "thought:The README probably documents the project.",
      "thought:I'll open the README first.",
      "status:Running read_file...",
      "tool-started:read_file",
      "tool-result:read_file",
      "status:Finished read_file.",
      "status:Reviewing tool results...",
      "delta:The README is short.",
      "done",
    ]);
  });

  it("executes an approved write_file in the main process", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
    });
    const writeTextFile = vi.fn(async (filePath: string) => filePath);
    queuePlanTurn({
      content: "I'll create the file.",
      toolCalls: [
        {
          function: {
            name: "write_file",
            arguments: {
              path: "src/new.ts",
              content: "export {};\n",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "Created the file." });

    const { events, finished } = collectRun({ writeTextFile });
    await finished;

    expect(writeTextFile).toHaveBeenCalledWith(
      "/workspace/src/new.ts",
      "export {};\n",
    );
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "write_file",
    );
    expect(resultEvent?.toolResult).toEqual({
      callId: expect.any(String),
      ok: true,
      message: "/workspace/src/new.ts",
      result: "/workspace/src/new.ts",
    });
    expect(vi.mocked(streamPlanTurn).mock.calls[1][1].messages).toContainEqual({
      role: "tool",
      content: "Executed write_file. /workspace/src/new.ts",
    });
  });

  it("does not write when the user skips the write_file card", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: false,
      rejected: true,
    });
    const writeTextFile = vi.fn(async (filePath: string) => filePath);
    queuePlanTurn({
      content: "I'll replace the file.",
      toolCalls: [
        {
          function: {
            name: "write_file",
            arguments: { path: "src/new.ts", content: "export {};\n" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "No change was made." });

    const { events, finished } = collectRun({ writeTextFile });
    await finished;

    expect(writeTextFile).not.toHaveBeenCalled();
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "write_file",
    );
    expect(resultEvent?.toolResult?.rejected).toBe(true);
  });

  it("reports a main-process write failure to the model", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
    });
    const writeTextFile = vi.fn(async () => {
      throw new Error("permission denied");
    });
    queuePlanTurn({
      content: "I'll create the file.",
      toolCalls: [
        {
          function: {
            name: "write_file",
            arguments: { path: "src/new.ts", content: "export {};\n" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The write failed." });

    const { events, finished } = collectRun({ writeTextFile });
    await finished;

    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "write_file",
    );
    expect(resultEvent?.toolResult).toEqual({
      callId: expect.any(String),
      ok: false,
      message: "permission denied",
    });
    expect(vi.mocked(streamPlanTurn).mock.calls[1][1].messages).toContainEqual({
      role: "tool",
      content: "Running write_file failed: permission denied",
    });
  });

  it("executes an approved create_directory in the main process", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
    });
    const createDirectory = vi.fn(async (directoryPath: string) => directoryPath);
    queuePlanTurn({
      content: "I'll create the folder.",
      toolCalls: [
        {
          function: {
            name: "create_directory",
            arguments: { path: "src/components" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "Created the folder." });

    const { events, finished } = collectRun({ createDirectory });
    await finished;

    expect(createDirectory).toHaveBeenCalledWith("/workspace/src/components");
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "create_directory",
    );
    expect(resultEvent?.toolResult).toEqual({
      callId: expect.any(String),
      ok: true,
      message: "/workspace/src/components",
      result: "/workspace/src/components",
    });
    expect(vi.mocked(streamPlanTurn).mock.calls[1][1].messages).toContainEqual({
      role: "tool",
      content: "Executed create_directory. /workspace/src/components",
    });
  });

  it("does not create a folder when the user skips the card", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: false,
      rejected: true,
    });
    const createDirectory = vi.fn(async (directoryPath: string) => directoryPath);
    queuePlanTurn({
      content: "I'll create the folder.",
      toolCalls: [
        {
          function: {
            name: "create_directory",
            arguments: { path: "src/components" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "No folder was created." });

    const { events, finished } = collectRun({ createDirectory });
    await finished;

    expect(createDirectory).not.toHaveBeenCalled();
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "create_directory",
    );
    expect(resultEvent?.toolResult?.rejected).toBe(true);
  });

  it("runs an approved command and returns its output to the model", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
    });
    const controller = commandController();
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The tests passed." });

    const { events, finished } = collectRun({
      commandController: controller,
    });
    await finished;

    expect(controller.prepare).toHaveBeenCalledWith({
      command: "npm test",
      cwd: undefined,
    });
    expect(controller.run).toHaveBeenCalledWith(
      { command: "npm test", cwd: "/workspace" },
      expect.any(AbortSignal),
    );
    expect(proposeUiTool).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: "run_command",
        arguments: expect.objectContaining({
          description: "Run the test suite to verify the changes.",
        }),
      }),
      expect.any(Function),
    );
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "run_command",
    );
    expect(resultEvent?.toolResult).toEqual({
      callId: expect.any(String),
      ok: true,
      message: "Finished.",
      result: "Command finished successfully.\n\nhello",
    });
    expect(vi.mocked(streamPlanTurn).mock.calls[1][1].messages).toContainEqual({
      role: "tool",
      content: "Command finished successfully.\n\nhello",
    });
  });

  it("adds a command to the allowlist when the user allows it for the session", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
      allowForSession: true,
    });
    const controller = commandController();
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The tests passed." });

    const { finished } = collectRun({ commandController: controller });
    await finished;

    expect(controller.allow).toHaveBeenCalledWith({
      command: "npm test",
      cwd: "/workspace",
    });
  });

  it("skips the proposal when allowlist mode already trusts the command", async () => {
    const controller = commandController({
      mode: "allowlist",
      isAllowed: vi.fn(() => true),
    });
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The tests passed." });

    const { events, finished } = collectRun({
      commandController: controller,
    });
    await finished;

    expect(proposeUiTool).not.toHaveBeenCalled();
    expect(controller.run).toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool-started" }),
    );
  });

  it("still asks in ask mode when the command is allowlisted", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
    });
    const controller = commandController({
      mode: "ask",
      isAllowed: vi.fn(() => true),
    });
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The tests passed." });

    const { finished } = collectRun({ commandController: controller });
    await finished;

    expect(proposeUiTool).toHaveBeenCalled();
  });

  it("runs a command without a proposal in auto mode", async () => {
    const controller = commandController({ mode: "auto" });
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The tests passed." });

    const { finished } = collectRun({ commandController: controller });
    await finished;

    expect(proposeUiTool).not.toHaveBeenCalled();
    expect(controller.run).toHaveBeenCalled();
  });

  it("reports a command failure and its output to the model", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: true,
    });
    const controller = commandController({
      run: vi.fn(async () => ({
        ok: false,
        message: "Exited with code 1.",
        result: "Command exited with code 1.\n\nerror",
      })),
    });
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The tests failed." });

    const { events, finished } = collectRun({
      commandController: controller,
    });
    await finished;

    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "run_command",
    );
    expect(resultEvent?.toolResult).toEqual({
      callId: expect.any(String),
      ok: false,
      message: "Exited with code 1.",
      result: "Command exited with code 1.\n\nerror",
    });
    expect(vi.mocked(streamPlanTurn).mock.calls[1][1].messages).toContainEqual({
      role: "tool",
      content: "Command exited with code 1.\n\nerror",
    });
  });

  it("does not run a command when the user skips the card", async () => {
    vi.mocked(proposeUiTool).mockResolvedValue({
      callId: "approval",
      ok: false,
      rejected: true,
    });
    const controller = commandController();
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "No command was run." });

    const { events, finished } = collectRun({
      commandController: controller,
    });
    await finished;

    expect(controller.run).not.toHaveBeenCalled();
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "run_command",
    );
    expect(resultEvent?.toolResult?.rejected).toBe(true);
  });

  it("rejects a command without a description before asking the user", async () => {
    const controller = commandController();
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: { command: "npm test" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The command was invalid." });

    const { events, finished } = collectRun({
      commandController: controller,
    });
    await finished;

    expect(proposeUiTool).not.toHaveBeenCalled();
    expect(controller.prepare).not.toHaveBeenCalled();
    expect(controller.run).not.toHaveBeenCalled();
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "run_command",
    );
    expect(resultEvent?.toolResult?.message).toBe(
      "No command description was provided.",
    );
  });

  it("reports an invalid command without asking the user", async () => {
    const controller = commandController({
      prepare: vi.fn(async () => {
        throw new Error("Command working directory must stay inside the workspace.");
      }),
    });
    queuePlanTurn({
      content: "I'll run the tests.",
      toolCalls: [
        {
          function: {
            name: "run_command",
            arguments: {
              command: "npm test",
              description: "Run the test suite to verify the changes.",
              cwd: "..",
            },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The command was invalid." });

    const { events, finished } = collectRun({
      commandController: controller,
    });
    await finished;

    expect(proposeUiTool).not.toHaveBeenCalled();
    expect(controller.run).not.toHaveBeenCalled();
    const resultEvent = events.find(
      (event) =>
        event.type === "tool-result" && event.tool?.name === "run_command",
    );
    expect(resultEvent?.toolResult?.message).toContain("inside the workspace");
  });

  it("streams when the planning turn returns no content", async () => {
    queuePlanTurn({ content: "   " });
    vi.mocked(startCoreAiStream).mockImplementation((input) => {
      input.send({ requestId: input.requestId ?? "stream", type: "done", done: true });
      return { success: true, requestId: input.requestId ?? "stream" };
    });

    const { events, finished, requestId } = collectRun();
    await finished;

    expect(startCoreAiStream).toHaveBeenCalledTimes(1);
    expect(events).not.toContainEqual({
      requestId,
      type: "delta",
      delta: "   ",
    });
    expect(events[events.length - 1]).toEqual({
      requestId,
      type: "done",
      done: true,
    });
  });
});
