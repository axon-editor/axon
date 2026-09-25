/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createAssetProtocolResponse, getAssetContentType } from "./assetProtocol";

describe("getAssetContentType", () => {
  it("serves the media a markdown preview or README can reference", () => {
    expect(getAssetContentType("shot.png")).toBe("image/png");
    expect(getAssetContentType("logo.svg")).toBe("image/svg+xml");
    expect(getAssetContentType("clip.webm")).toBe("video/webm");
  });

  it("refuses document and script content types", () => {
    // A markdown link or image must never be able to pull local HTML or JS into
    // the privileged renderer origin.
    expect(getAssetContentType("notes.md")).toBeNull();
    expect(getAssetContentType("app.js")).toBeNull();
    expect(getAssetContentType("secrets.env")).toBeNull();
  });
});

describe("createAssetProtocolResponse", () => {
  it("streams the resolved file with its content type", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "axon-asset-"));
    const imagePath = path.join(directory, "shot.png");
    await writeFile(imagePath, Buffer.from([137, 80, 78, 71]));

    const response = await createAssetProtocolResponse(
      new Request("axon://local/ticket", { headers: { Origin: "null" } }),
      (token) => (token === "ticket" ? imagePath : null),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
  });

  it("answers 404 for an unknown ticket and 403 for a blocked origin", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "axon-asset-"));
    const imagePath = path.join(directory, "shot.png");
    await writeFile(imagePath, Buffer.from([1, 2, 3]));

    const unknown = await createAssetProtocolResponse(
      new Request("axon://local/missing", { headers: { Origin: "null" } }),
      () => null,
    );
    expect(unknown.status).toBe(404);

    const blocked = await createAssetProtocolResponse(
      new Request("axon://local/ticket", {
        headers: { Origin: "https://evil.example" },
      }),
      () => imagePath,
    );
    expect(blocked.status).toBe(403);
  });

  it("refuses to serve a file whose type is not an asset", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "axon-asset-"));
    const scriptPath = path.join(directory, "payload.js");
    await writeFile(scriptPath, "console.log(1)");

    const response = await createAssetProtocolResponse(
      new Request("axon://local/ticket", { headers: { Origin: "null" } }),
      () => scriptPath,
    );

    expect(response.status).toBe(403);
  });
});
