// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import {
  setAuthCookies,
  clearAuthCookies,
  getAccessToken,
  getRefreshToken,
  setCsrfSecretCookie,
  getCsrfSecret,
} from "./authCookies";

function createApp() {
  return new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
}

describe("setAuthCookies", () => {
  it("正常系: access_token・refresh_token を httpOnly; Secure; SameSite=None; Path=/ でセットする", async () => {
    // 準備
    const app = createApp();
    app.get("/set", (c) => {
      setAuthCookies(c, { access_token: "at-1", refresh_token: "rt-1" });
      return c.body(null);
    });

    // Act
    const res = await app.request("/set");

    // Assert
    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(", ");
    const accessCookie = setCookieHeaders.find((h) => h.startsWith("access_token="));
    const refreshCookie = setCookieHeaders.find((h) => h.startsWith("refresh_token="));

    expect(accessCookie).toContain("access_token=at-1");
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("Secure");
    expect(accessCookie).toContain("SameSite=None");
    expect(accessCookie).toContain("Path=/");
    expect(accessCookie).not.toMatch(/Max-Age/i);

    expect(refreshCookie).toContain("refresh_token=rt-1");
    expect(refreshCookie).toContain("HttpOnly");
  });
});

describe("clearAuthCookies", () => {
  it("正常系: access_token・refresh_token・csrf_secret の3本を削除する", async () => {
    // 準備
    const app = createApp();
    app.get("/clear", (c) => {
      clearAuthCookies(c);
      return c.body(null);
    });

    // Act
    const res = await app.request("/clear");

    // Assert
    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(", ");
    expect(setCookieHeaders.some((h) => h.startsWith("access_token="))).toBe(true);
    expect(setCookieHeaders.some((h) => h.startsWith("refresh_token="))).toBe(true);
    expect(setCookieHeaders.some((h) => h.startsWith("csrf_secret="))).toBe(true);
    // 削除は過去日付の Expires か Max-Age=0 を伴う
    for (const h of setCookieHeaders) {
      expect(h).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    }
  });
});

describe("getAccessToken / getRefreshToken", () => {
  it("正常系: Cookie から access_token・refresh_token を取り出す", async () => {
    // 準備
    const app = createApp();
    app.get("/read", (c) =>
      c.json({
        access: getAccessToken(c) ?? null,
        refresh: getRefreshToken(c) ?? null,
      }),
    );

    // Act
    const res = await app.request("/read", {
      headers: { Cookie: "access_token=at-1; refresh_token=rt-1" },
    });

    // Assert
    expect(await res.json()).toEqual({ access: "at-1", refresh: "rt-1" });
  });

  it("異常系: Cookie がないとき undefined を返す", async () => {
    // 準備
    const app = createApp();
    app.get("/read", (c) =>
      c.json({
        access: getAccessToken(c) ?? null,
        refresh: getRefreshToken(c) ?? null,
      }),
    );

    // Act
    const res = await app.request("/read");

    // Assert
    expect(await res.json()).toEqual({ access: null, refresh: null });
  });
});

describe("setCsrfSecretCookie / getCsrfSecret", () => {
  it("正常系: csrf_secret を httpOnly Cookie としてセットし、getCsrfSecret で読める", async () => {
    // 準備
    const app = createApp();
    app.get("/set", (c) => {
      setCsrfSecretCookie(c, "secret-xyz");
      return c.body(null);
    });
    app.get("/read", (c) => c.json({ secret: getCsrfSecret(c) ?? null }));

    // Act
    const setRes = await app.request("/set");
    const setCookieHeaders = setRes.headers.getSetCookie
      ? setRes.headers.getSetCookie()
      : (setRes.headers.get("set-cookie") ?? "").split(", ");
    const csrfCookie = setCookieHeaders.find((h) => h.startsWith("csrf_secret="));

    // Assert: セット時属性
    expect(csrfCookie).toContain("csrf_secret=secret-xyz");
    expect(csrfCookie).toContain("HttpOnly");

    // Assert: 読み取り
    const readRes = await app.request("/read", {
      headers: { Cookie: "csrf_secret=secret-xyz" },
    });
    expect(await readRes.json()).toEqual({ secret: "secret-xyz" });
  });
});
