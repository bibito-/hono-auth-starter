// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, HonoVariables } from "@shared/types/hono";
import { deriveCsrfToken } from "../../lib/csrf";

const { createClientMock, getUserMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const getUserMock = vi.fn();
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }));
  return { createClientMock, getUserMock, singleMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { meHandler } from "./me";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  CSRF_HMAC_SECRET: "hmac-secret",
} as unknown as CloudflareBindings;

const CALLER: AuthenticatedUser = { id: "user-1" };

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  // authMiddleware 通過後を模す
  app.use("/api/auth/me", async (c, next) => {
    c.set("user", CALLER);
    await next();
  });
  app.get("/api/auth/me", meHandler);
  return app;
}

function get(cookie?: string) {
  return createApp().request(
    "/api/auth/me",
    { method: "GET", headers: cookie ? { Cookie: cookie } : {} },
    env,
  );
}

describe("meHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "taro@example.com",
          user_metadata: { name: "太郎" },
        },
      },
      error: null,
    });
    singleMock.mockResolvedValue({ data: { role: "staff", username: "taro" }, error: null });
  });

  it("正常系: access_token・csrf_secret があるとき 200 で user・csrf_token を返す", async () => {
    // Act
    const res = await get("access_token=at-1; csrf_secret=secret-1");

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json<{ user: unknown; csrf_token: string }>();
    expect(body.user).toEqual({
      id: "user-1",
      name: "太郎",
      email: "taro@example.com",
      role: "staff",
      username: "taro",
    });
    const expected = await deriveCsrfToken("secret-1", env.CSRF_HMAC_SECRET);
    expect(body.csrf_token).toBe(expected);
  });

  it("正常系: caller の access_token + publishable key でスコープする（service_role を使わない）", async () => {
    // Act
    await get("access_token=at-1; csrf_secret=secret-1");

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "pk-test",
      { global: { headers: { Authorization: "Bearer at-1" } } },
    );
  });

  it("異常系: csrf_secret Cookie がないとき 401", async () => {
    // Act
    const res = await get("access_token=at-1");

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: getUser が失敗したとき 401", async () => {
    // 準備
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });

    // Act
    const res = await get("access_token=at-1; csrf_secret=secret-1");

    // Assert
    expect(res.status).toBe(401);
  });
});
