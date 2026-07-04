// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { deriveCsrfToken } from "../../lib/csrf";

// ── Supabase クライアントモック ──────────────────────────
// auth.signInWithPassword（認証呼び出し）と from("profiles")（プロフィール取得）
// の両方を、単一の createClient モックが返すオブジェクトでまかなう。
const { createClientMock, signInWithPasswordMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const signInWithPasswordMock = vi.fn();
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { signInWithPassword: signInWithPasswordMock },
    from: fromMock,
  }));
  return { createClientMock, signInWithPasswordMock, singleMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { loginHandler } from "./login";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  CSRF_HMAC_SECRET: "hmac-secret",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.post("/api/auth/login", loginHandler);
  return app;
}

function post(body: object) {
  return createApp().request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

function getSetCookies(res: Response): string[] {
  return res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(", ");
}

const SUCCESS_SESSION = {
  user: {
    id: "user-1",
    email: "taro@example.com",
    user_metadata: { name: "太郎" },
  },
  session: { access_token: "new-access-token", refresh_token: "new-refresh-token" },
};

describe("loginHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPasswordMock.mockResolvedValue({ data: SUCCESS_SESSION, error: null });
    singleMock.mockResolvedValue({ data: { role: "staff", username: "taro" }, error: null });
  });

  it("正常系: 200 で user と csrf_token を返す", async () => {
    // Act
    const res = await post({ email: "taro@example.com", password: "correct-password" });

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
    expect(typeof body.csrf_token).toBe("string");
  });

  it("正常系: access_token・refresh_token・csrf_secret を httpOnly Cookie としてセットする", async () => {
    // Act
    const res = await post({ email: "taro@example.com", password: "correct-password" });

    // Assert
    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith("access_token=new-access-token"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token=new-refresh-token"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("csrf_secret="))).toBe(true);
    for (const c of cookies) {
      expect(c).toContain("HttpOnly");
    }
  });

  it("正常系: csrf_token はレスポンスの csrf_secret Cookie から HMAC 導出した値と一致する", async () => {
    // Act
    const res = await post({ email: "taro@example.com", password: "correct-password" });
    const body = await res.json<{ csrf_token: string }>();
    const cookies = getSetCookies(res);
    const csrfCookie = cookies.find((c) => c.startsWith("csrf_secret="))!;
    const csrfSecret = csrfCookie.split(";")[0].split("=")[1];

    // Assert
    const expected = await deriveCsrfToken(csrfSecret, env.CSRF_HMAC_SECRET);
    expect(body.csrf_token).toBe(expected);
  });

  it("正常系: profile 取得は新しい access_token + publishable key でスコープする（service_role を使わない）", async () => {
    // Act
    await post({ email: "taro@example.com", password: "correct-password" });

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "pk-test",
      { global: { headers: { Authorization: "Bearer new-access-token" } } },
    );
    const passedKeys = createClientMock.mock.calls.map((call) => call[1]);
    expect(passedKeys).not.toContain("service-role-secret");
  });

  it("異常系: signInWithPassword がエラーのとき 401 invalid_credentials", async () => {
    // 準備
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    // Act
    const res = await post({ email: "taro@example.com", password: "wrong-password" });

    // Assert
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("異常系: email が欠けているとき 401 invalid_credentials（Supabase を呼ばない）", async () => {
    // Act
    const res = await post({ password: "correct-password" });

    // Assert
    expect(res.status).toBe(401);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("異常系: password が欠けているとき 401 invalid_credentials（Supabase を呼ばない）", async () => {
    // Act
    const res = await post({ email: "taro@example.com" });

    // Assert
    expect(res.status).toBe(401);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });
});
