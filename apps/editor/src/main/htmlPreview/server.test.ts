import { describe, expect, it } from "vitest";
import { authorizeHtmlPreviewRequest } from "./server";

describe("HTML preview server access", () => {
  it("rejects requests that have neither the target token nor its strict cookie", () => {
    expect(
      authorizeHtmlPreviewRequest({
        accessToken: "secret-token",
        pathname: "/index.html",
        serverId: "preview-1",
      }),
    ).toMatchObject({ authorized: false, pathname: "/index.html" });
  });

  it("exchanges the target token for a strict cookie used by nested assets", () => {
    const initialRequest = authorizeHtmlPreviewRequest({
      accessToken: "secret-token",
      pathname: "/secret-token/index.html",
      serverId: "preview-1",
    });
    expect(initialRequest).toMatchObject({
      authorized: true,
      pathname: "/index.html",
    });
    expect(initialRequest.setCookie).toContain("HttpOnly");
    expect(initialRequest.setCookie).toContain("SameSite=Strict");

    expect(
      authorizeHtmlPreviewRequest({
        accessToken: "secret-token",
        cookieHeader: initialRequest.setCookie?.split(";")[0],
        pathname: "/styles/image.svg",
        serverId: "preview-1",
      }),
    ).toMatchObject({
      authorized: true,
      pathname: "/styles/image.svg",
      setCookie: null,
    });
  });
});
