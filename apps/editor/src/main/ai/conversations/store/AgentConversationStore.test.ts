/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentConversationRecord,
  type AgentConversationSnapshot,
} from "../../../../shared/ai/agentConversations";
import { conversationFileName } from "../files/conversationFileName";
import { AgentConversationStore } from "./AgentConversationStore";

const temporaryDirectories: string[] = [];

function createStore() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "axon-agent-conversations-"),
  );
  temporaryDirectories.push(directory);
  const sessionsRoot = path.join(directory, "sessions");
  return {
    store: new AgentConversationStore(sessionsRoot),
    sessionsRoot,
  };
}

function conversation(
  overrides: Partial<AgentConversationRecord> = {},
): AgentConversationRecord {
  return {
    id: "conversation-1",
    title: "Test conversation",
    createdAt: 1,
    updatedAt: 2,
    pinned: false,
    action: "agent",
    messages: [{ id: 1, role: "user", content: "hello" }],
    ...overrides,
  };
}

function state(
  ...conversations: AgentConversationRecord[]
): AgentConversationSnapshot {
  return {
    activeId: conversations[0]?.id ?? "",
    conversations,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("AgentConversationStore", () => {
  it("writes workspace, index, conversation files, and a README", () => {
    const { store, sessionsRoot } = createStore();
    const first = conversation();
    store.save("/workspace/axon", state(first));

    const directory = store.pathFor("/workspace/axon");
    const conversationPath = path.join(
      directory,
      conversationFileName(first.id),
    );

    expect(fs.existsSync(path.join(directory, "workspace.json"))).toBe(true);
    expect(fs.existsSync(path.join(directory, "index.json"))).toBe(true);
    expect(fs.existsSync(conversationPath)).toBe(true);
    expect(fs.existsSync(path.join(sessionsRoot, "README.md"))).toBe(true);

    const workspace = JSON.parse(
      fs.readFileSync(path.join(directory, "workspace.json"), "utf8"),
    );
    expect(workspace).toEqual({
      version: 1,
      folderPath: path.resolve("/workspace/axon"),
    });

    const saved = JSON.parse(fs.readFileSync(conversationPath, "utf8"));
    expect(saved.workspacePath).toBe(path.resolve("/workspace/axon"));
    expect(saved.conversation).toEqual(first);

    const index = JSON.parse(
      fs.readFileSync(path.join(directory, "index.json"), "utf8"),
    );
    expect(index.activeId).toBe(first.id);
    expect(index.conversations[0]).toMatchObject({
      id: first.id,
      title: first.title,
      file: conversationFileName(first.id),
    });
  });

  it("loads the saved state", () => {
    const { store } = createStore();
    const savedState = state(
      conversation(),
      conversation({ id: "conversation-2", title: "Second" }),
    );

    store.save("/workspace/axon", savedState);

    expect(store.load("/workspace/axon")).toEqual(savedState);
  });

  it("targeted saves update one conversation and the index", () => {
    const { store } = createStore();
    const first = conversation();
    const second = conversation({ id: "conversation-2", title: "Second" });
    store.save("/workspace/axon", state(first, second));

    const updated = conversation({
      updatedAt: 3,
      messages: [{ id: 2, role: "assistant", content: "updated" }],
    });
    store.saveConversation("/workspace/axon", updated, first.id);

    const loaded = store.load("/workspace/axon");
    expect(loaded?.conversations[0]).toEqual(updated);
    expect(loaded?.conversations[1]).toEqual(second);
  });

  it("rebuilds the index on a targeted save when the index is corrupt", () => {
    const { store } = createStore();
    const first = conversation();
    const second = conversation({ id: "conversation-2", title: "Second" });
    store.save("/workspace/axon", state(first, second));

    const directory = store.pathFor("/workspace/axon");
    fs.writeFileSync(path.join(directory, "index.json"), "{", "utf8");

    const updated = conversation({
      updatedAt: 3,
      messages: [{ id: 2, role: "assistant", content: "updated" }],
    });
    store.saveConversation("/workspace/axon", updated, first.id);

    const loaded = store.load("/workspace/axon");
    expect(loaded?.activeId).toBe(first.id);
    expect(loaded?.conversations).toHaveLength(2);
    expect(loaded?.conversations).toEqual(
      expect.arrayContaining([updated, second]),
    );
  });

  it("removes conversation files that are no longer in the state", () => {
    const { store } = createStore();
    const first = conversation();
    const second = conversation({ id: "conversation-2", title: "Second" });
    store.save("/workspace/axon", state(first, second));

    const directory = store.pathFor("/workspace/axon");
    const secondPath = path.join(directory, conversationFileName(second.id));
    expect(fs.existsSync(secondPath)).toBe(true);

    store.save("/workspace/axon", state(first));

    expect(fs.existsSync(secondPath)).toBe(false);
  });

  it("does not delete agent-added JSON files", () => {
    const { store } = createStore();
    const first = conversation();
    store.save("/workspace/axon", state(first));

    const directory = store.pathFor("/workspace/axon");
    const notesPath = path.join(directory, "notes.json");
    fs.writeFileSync(notesPath, "{}", "utf8");

    store.save("/workspace/axon", state(conversation({ id: "conversation-2" })));

    expect(fs.existsSync(notesPath)).toBe(true);
  });

  it("uses no-workspace for a null folder path", () => {
    const { store } = createStore();
    const savedState = state(conversation());

    expect(path.basename(store.pathFor(null))).toBe("no-workspace");
    store.save(null, savedState);
    expect(store.load(null)).toEqual(savedState);
  });

  it("sanitizes conversation ids in file names", () => {
    const { store } = createStore();
    const unsafe = conversation({ id: "../../escape" });
    store.save("/workspace/axon", state(unsafe));

    const directory = store.pathFor("/workspace/axon");
    const entries = fs.readdirSync(directory);

    expect(entries).toContain(conversationFileName(unsafe.id));
    expect(entries.every((entry) => !entry.includes("/"))).toBe(true);
    expect(store.load("/workspace/axon")?.conversations[0].id).toBe(
      "../../escape",
    );
  });

  it("keeps long conversation ids within the file name limit", () => {
    const { store } = createStore();
    const longId = "a".repeat(200);
    const longConversation = conversation({ id: longId });
    store.save("/workspace/axon", state(longConversation));

    const directory = store.pathFor("/workspace/axon");
    const entries = fs
      .readdirSync(directory)
      .filter((entry) => entry.startsWith("conversation-"));

    expect(entries).toHaveLength(1);
    expect(entries[0].length).toBeLessThan(120);
    expect(store.load("/workspace/axon")?.conversations[0].id).toBe(longId);
  });

  it("ignores a corrupt conversation file", () => {
    const { store } = createStore();
    const first = conversation();
    const second = conversation({ id: "conversation-2", title: "Second" });
    store.save("/workspace/axon", state(first, second));

    const directory = store.pathFor("/workspace/axon");
    fs.writeFileSync(
      path.join(directory, conversationFileName(first.id)),
      "{",
      "utf8",
    );

    expect(store.load("/workspace/axon")).toEqual(state(second));
  });

  it("recovers conversations when the index is missing", () => {
    const { store } = createStore();
    const first = conversation();
    const second = conversation({
      id: "conversation-2",
      title: "Second",
      updatedAt: 3,
    });
    store.save("/workspace/axon", state(first, second));

    const directory = store.pathFor("/workspace/axon");
    fs.rmSync(path.join(directory, "index.json"));

    expect(store.load("/workspace/axon")).toEqual({
      activeId: second.id,
      conversations: [first, second],
    });
  });

  it("recovers conversations when the index is corrupt", () => {
    const { store } = createStore();
    const first = conversation();
    const second = conversation({
      id: "conversation-2",
      title: "Second",
      updatedAt: 3,
    });
    store.save("/workspace/axon", state(first, second));

    const directory = store.pathFor("/workspace/axon");
    fs.writeFileSync(path.join(directory, "index.json"), "{", "utf8");

    expect(store.load("/workspace/axon")).toEqual({
      activeId: second.id,
      conversations: [first, second],
    });
  });

  it("returns null when the index is missing", () => {
    const { store } = createStore();

    expect(store.load("/workspace/missing")).toBeNull();
  });

  it("returns an empty state when the index has no conversations", () => {
    const { store } = createStore();
    const directory = store.pathFor("/workspace/empty");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "index.json"),
      JSON.stringify({ version: 1, activeId: "", conversations: [] }),
      "utf8",
    );

    expect(store.load("/workspace/empty")).toEqual({
      activeId: "",
      conversations: [],
    });
  });

  it("uses a stable workspace id for equivalent paths", () => {
    const { store } = createStore();

    expect(store.pathFor("/workspace/axon")).toBe(
      store.pathFor("/workspace/axon/"),
    );
  });

  it("keeps workspace folder names short", () => {
    const { store } = createStore();
    const folderPath = `/workspace/${"a".repeat(200)}`;

    expect(path.basename(store.pathFor(folderPath)).length).toBeLessThan(100);
  });

  it("rejects an invalid state", () => {
    const { store } = createStore();

    expect(() =>
      store.save(
        "/workspace/axon",
        { activeId: "", conversations: [{}] } as unknown as AgentConversationSnapshot,
      ),
    ).toThrow("Invalid agent conversation state.");
  });

  it("rejects an invalid conversation on a targeted save", () => {
    const { store } = createStore();

    expect(() =>
      store.saveConversation(
        "/workspace/axon",
        {} as unknown as AgentConversationRecord,
        "conversation-1",
      ),
    ).toThrow("Invalid agent conversation.");
  });
});
