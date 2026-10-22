/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  AXON_GIT_COMMIT_DIFF_TAB_PREFIX,
  AXON_GIT_GRAPH_TAB_PATH,
} from "@axon-builtin-git/git/lib/gitGraphTab";
import { createHtmlPreviewTabPath } from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import { createMarkdownPreviewTabPath } from "@axon-builtin-markdown/lib/markdownPreviewTabs";
import { AXON_WELCOME_TAB_PATH } from "../../../onboarding/lib/welcomeTab";
import { getFileBackedTabPath } from "../../lib/layout/navigation/tabIdentity";

describe("getFileBackedTabPath", () => {
  it("keeps a regular file tab unchanged", () => {
    expect(getFileBackedTabPath("/workspace/src/index.ts")).toBe(
      "/workspace/src/index.ts",
    );
  });

  it("resolves preview tabs to the file they render", () => {
    expect(
      getFileBackedTabPath(
        createHtmlPreviewTabPath("/workspace/public/index.html"),
      ),
    ).toBe("/workspace/public/index.html");
    expect(
      getFileBackedTabPath(
        createMarkdownPreviewTabPath("/workspace/docs/readme.md"),
      ),
    ).toBe("/workspace/docs/readme.md");
  });

  it("rejects generated tabs that have no workspace file", () => {
    expect(getFileBackedTabPath(AXON_GIT_GRAPH_TAB_PATH)).toBeNull();
    expect(
      getFileBackedTabPath(`${AXON_GIT_COMMIT_DIFF_TAB_PREFIX}commit`),
    ).toBeNull();
    expect(getFileBackedTabPath(AXON_WELCOME_TAB_PATH)).toBeNull();
  });

  it("has no path when no tab is active", () => {
    expect(getFileBackedTabPath(null)).toBeNull();
  });
});
