/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { normalizeState } from "./normalizeState";

describe("normalizeState", () => {
  it("preserves the persisted OpenCode session id", () => {
    const state = normalizeState({
      activeId: "c1",
      conversations: [
        {
          id: "c1",
          title: "Test",
          createdAt: 1,
          updatedAt: 2,
          pinned: false,
          action: "agent",
          messages: [],
          backendSessionId: "ses_123",
        },
      ],
    });

    expect(state?.conversations[0]?.backendSessionId).toBe("ses_123");
  });
});
