// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

const { createClientMock, setSessionMock, signOutMock } = vi.hoisted(() => {
  const setSessionMock = vi.fn<() => Promise<{ error: { message: string } | null }>>(() =>
    Promise.resolve({ error: null }),
  );
  const signOutMock = vi.fn<() => Promise<{ error: { message: string } | null }>>(() =>
    Promise.resolve({ error: null }),
  );
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { setSession: setSessionMock, signOut: signOutMock },
  }));
  return { createClientMock, setSessionMock, signOutMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { logoutHandler } from "./logout";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.post("/api/auth/logout", logoutHandler);
  return app;
}

function post(cookie?: string) {
  return createApp().request(
    "/api/auth/logout",
    { method: "POST", headers: cookie ? { Cookie: cookie } : {} },
    env,
  );
}

function getSetCookies(res: Response): string[] {
  return res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(", ");
}

describe("logoutHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: Cookie が揃っているとき signOut を呼び、200 で Cookie を全て削除する", async () => {
    // Act
    const res = await post("access_token=at-1; refresh_token=rt-1");

    // Assert
    expect(res.status).toBe(200);
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "at-1",
      refresh_token: "rt-1",
    });
    expect(signOutMock).toHaveBeenCalled();
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

  it("異常系: signOut が失敗しても 200 を返し Cookie を削除する（fail-safe）", async () => {
    // 準備
    signOutMock.mockResolvedValueOnce({ error: { message: "network error" } });

    // Act
    const res = await post("access_token=at-1; refresh_token=rt-1");

    // Assert
    expect(res.status).toBe(200);
    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith("access_token=") && c.includes("Max-Age=0"))).toBe(
      true,
    );
  });

  it("異常系: Supabase 呼び出しが例外を投げても 200 を返し Cookie を削除する（fail-safe）", async () => {
    // 準備
    setSessionMock.mockRejectedValueOnce(new Error("boom"));

    // Act
    const res = await post("access_token=at-1; refresh_token=rt-1");

    // Assert
    expect(res.status).toBe(200);
    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith("access_token=") && c.includes("Max-Age=0"))).toBe(
      true,
    );
  });

  it("正常系: Cookie が無いとき Supabase を呼ばず 200 で Cookie 削除だけ行う", async () => {
    // Act
    const res = await post(undefined);

    // Assert
    expect(res.status).toBe(200);
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith("access_token=") && c.includes("Max-Age=0"))).toBe(
      true,
    );
  });
});
