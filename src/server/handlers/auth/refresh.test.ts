// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { deriveCsrfToken } from "../../lib/csrf";

const { createClientMock, refreshSessionMock } = vi.hoisted(() => {
  const refreshSessionMock = vi.fn();
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { refreshSession: refreshSessionMock },
  }));
  return { createClientMock, refreshSessionMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { refreshHandler } from "./refresh";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  CSRF_HMAC_SECRET: "hmac-secret",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.post("/api/auth/refresh", refreshHandler);
  return app;
}

function post(cookie?: string) {
  return createApp().request(
    "/api/auth/refresh",
    { method: "POST", headers: cookie ? { Cookie: cookie } : {} },
    env,
  );
}

function getSetCookies(res: Response): string[] {
  return res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(", ");
}

describe("refreshHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 有効な refresh_token のとき 200 で csrf_token を返し、Cookie を再発行する", async () => {
    // 準備
    refreshSessionMock.mockResolvedValue({
      data: { session: { access_token: "new-at", refresh_token: "new-rt" } },
      error: null,
    });

    // Act
    const res = await post("refresh_token=old-rt");

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json<{ csrf_token: string }>();
    expect(typeof body.csrf_token).toBe("string");

    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith("access_token=new-at"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token=new-rt"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("csrf_secret="))).toBe(true);
  });

  it("正常系: csrf_token は新しい csrf_secret から導出した値と一致する", async () => {
    // 準備
    refreshSessionMock.mockResolvedValue({
      data: { session: { access_token: "new-at", refresh_token: "new-rt" } },
      error: null,
    });

    // Act
    const res = await post("refresh_token=old-rt");
    const body = await res.json<{ csrf_token: string }>();
    const cookies = getSetCookies(res);
    const csrfCookie = cookies.find((c) => c.startsWith("csrf_secret="))!;
    const csrfSecret = csrfCookie.split(";")[0].split("=")[1];

    // Assert
    const expected = await deriveCsrfToken(csrfSecret, env.CSRF_HMAC_SECRET);
    expect(body.csrf_token).toBe(expected);
  });

  it("異常系: refresh_token Cookie がないとき 401（Supabase を呼ばない）", async () => {
    // Act
    const res = await post(undefined);

    // Assert
    expect(res.status).toBe(401);
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("異常系: refreshSession が失敗したとき 401 かつ Cookie を全て削除する", async () => {
    // 準備
    refreshSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid refresh token" },
    });

    // Act
    const res = await post("refresh_token=old-rt");

    // Assert
    expect(res.status).toBe(401);
    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith("access_token=") && c.includes("Max-Age=0"))).toBe(
      true,
    );
    expect(cookies.some((c) => c.startsWith("refresh_token=") && c.includes("Max-Age=0"))).toBe(
      true,
    );
    expect(cookies.some((c) => c.startsWith("csrf_secret=") && c.includes("Max-Age=0"))).toBe(
      true,
    );
  });
});
