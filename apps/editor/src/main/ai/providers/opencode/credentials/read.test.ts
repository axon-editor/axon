/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readKeyFromDatabase } from "./read";

const { DatabaseSync } = process.getBuiltinModule(
  "node:sqlite",
) as typeof import("node:sqlite");

const CREDENTIAL_SCHEMA = `
  create table credential (
    id text primary key,
    integration_id text,
    value text,
    active integer,
    time_updated integer
  )
`;

describe("OpenCode credentials", () => {
  let root = "";
  let databasePath = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axon-opencode-"));
    databasePath = path.join(root, "opencode.db");
    const database = new DatabaseSync(databasePath);
    database.exec(CREDENTIAL_SCHEMA);
    database
      .prepare("insert into credential values (?, ?, ?, ?, ?)")
      .run(
        "cred_1",
        "opencode-go",
        JSON.stringify({ type: "key", key: "oc_sk_test" }),
        1,
        Date.now(),
      );
    database.close();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads the stored account key", () => {
    expect(readKeyFromDatabase(databasePath)).toBe("oc_sk_test");
  });

  it("ignores oauth credentials", () => {
    const database = new DatabaseSync(databasePath);
    database.exec("delete from credential");
    database
      .prepare("insert into credential values (?, ?, ?, ?, ?)")
      .run(
        "cred_2",
        "opencode-go",
        JSON.stringify({ type: "oauth", key: "unusable" }),
        1,
        Date.now(),
      );
    database.close();

    expect(readKeyFromDatabase(databasePath)).toBe("");
  });

  it("returns an empty key when the database is missing", () => {
    expect(readKeyFromDatabase(path.join(root, "missing.db"))).toBe("");
  });
});
