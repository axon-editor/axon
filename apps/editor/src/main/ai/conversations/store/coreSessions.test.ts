/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { type AgentConversationSnapshot } from "../../../../shared/ai/agentConversations";
import {
  loadCoreWorkspace,
  saveCoreConversation,
  saveCoreWorkspace,
} from "./coreSessions";

const core = { axonCorePort: "17777", axonCoreToken: "token" };

function snapshot(): AgentConversationSnapshot {
  return {
    activeId: "c1",
    conversations: [
      {
        id: "c1",
        title: "One",
        createdAt: 1,
        updatedAt: 2,
        pinned: false,
        action: "agent",
        messages: [],
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coreSessions", () => {
  it("loads a workspace snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        data: { activeId: "c1", conversations: snapshot().conversations },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await loadCoreWorkspace(core, "/workspace/axon");

    expect(loaded).toEqual(snapshot());
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17777/sessions/workspace?path=%2Fworkspace%2Faxon",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  it("returns null when core is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await loadCoreWorkspace(core, "/workspace/axon")).toBeNull();
  });

  it("saves a workspace snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveCoreWorkspace(core, "/workspace/axon", snapshot());

    expect(saved).toBe(true);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      folderPath: "/workspace/axon",
      activeId: "c1",
    });
  });

  it("saves one conversation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveCoreConversation(
      core,
      null,
      snapshot().conversations[0],
      "c1",
    );

    expect(saved).toBe(true);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      folderPath: null,
      activeId: "c1",
    });
  });
});
