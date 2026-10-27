/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { AXON_COMMANDS } from "../commands/commands";
import { aiUiToolDefinition, aiUiToolSpec } from "./uiTools";

describe("aiUiToolSpec", () => {
  it("maps close_active_tab to the close-tab command", () => {
    const spec = aiUiToolSpec("close_active_tab");

    expect(spec).toBeDefined();
    expect(spec?.command).toBe(AXON_COMMANDS.CLOSE_TAB);
  });

  it("defines close_file with a required path and no command", () => {
    const spec = aiUiToolSpec("close_file");

    expect(spec).toBeDefined();
    expect(spec?.command).toBeUndefined();
    expect(spec?.required).toEqual(["path"]);
    expect(spec?.parameters?.path.type).toBe("string");
  });

  it("defines write_file with path and content", () => {
    const spec = aiUiToolSpec("write_file");

    expect(spec).toBeDefined();
    expect(spec?.command).toBeUndefined();
    expect(spec?.required).toEqual(["path", "content"]);
    expect(spec?.parameters?.content.type).toBe("string");
  });
});

describe("aiUiToolDefinition", () => {
  it("builds a function schema carrying close_file's required path", () => {
    const spec = aiUiToolSpec("close_file");
    if (!spec) throw new Error("close_file spec missing");

    const definition = aiUiToolDefinition(spec);

    expect(definition.type).toBe("function");
    expect(definition.function.name).toBe("close_file");
    expect(definition.function.parameters.required).toEqual(["path"]);
  });
});
