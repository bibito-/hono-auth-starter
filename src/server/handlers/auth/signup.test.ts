// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

const { createClientMock, signUpMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const signUpMock = vi.fn();
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { signUp: signUpMock },
    from: fromMock,
  }));
  return { createClientMock, signUpMock, singleMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { signupHandler } from "./signup";

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
  app.post("/api/auth/signup", signupHandler);
  return app;
}

function post(body: object) {
  return createApp().request(
    "/api/auth/signup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

const VERIFIED_SESSION = {
  user: {
    id: "user-1",
    email: "taro@example.com",
    user_metadata: { name: "太郎" },
    identities: [{ id: "identity-1" }],
  },
  session: { access_token: "new-access-token", refresh_token: "new-refresh-token" },
};

describe("signupHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { role: null, username: null }, error: null });
  });

  it("正常系: メール確認不要（即セッション）のとき 200 verified で user・csrf_token を返す", async () => {
    // 準備
    signUpMock.mockResolvedValue({ data: VERIFIED_SESSION, error: null });

    // Act
    const res = await post({ email: "taro@example.com", password: "password123" });

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string; user: unknown; csrf_token: string }>();
    expect(body.status).toBe("verified");
    expect(body.user).toEqual({
      id: "user-1",
      name: "太郎",
      email: "taro@example.com",
      role: null,
      username: null,
    });
    expect(typeof body.csrf_token).toBe("string");
  });

  it("正常系: メール確認が有効（data.session が null）のとき 200 pending", async () => {
    // 準備
    signUpMock.mockResolvedValue({
      data: {
        user: { id: "user-1", identities: [{ id: "identity-1" }] },
        session: null,
      },
      error: null,
    });

    // Act
    const res = await post({ email: "taro@example.com", password: "password123" });

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "pending" });
  });

  it("異常系: 既に登録済み（identities.length === 0）のとき 400 failure", async () => {
    // 準備
    signUpMock.mockResolvedValue({
      data: { user: { id: "user-1", identities: [] }, session: null },
      error: null,
    });

    // Act
    const res = await post({ email: "taro@example.com", password: "password123" });

    // Assert
    expect(res.status).toBe(400);
    const body = await res.json<{ status: string; error: string }>();
    expect(body.status).toBe("failure");
    expect(typeof body.error).toBe("string");
  });

  it("異常系: signUp がエラーを返すとき 400 failure", async () => {
    // 準備
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Password should be at least 6 characters" },
    });

    // Act
    const res = await post({ email: "taro@example.com", password: "123" });

    // Assert
    expect(res.status).toBe(400);
    const body = await res.json<{ status: string; error: string }>();
    expect(body.status).toBe("failure");
    expect(body.error).toBe("Password should be at least 6 characters");
  });

  it("異常系: email が欠けているとき 400 failure（Supabase を呼ばない）", async () => {
    // Act
    const res = await post({ password: "password123" });

    // Assert
    expect(res.status).toBe(400);
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
