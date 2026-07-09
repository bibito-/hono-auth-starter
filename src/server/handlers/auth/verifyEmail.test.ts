// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { deriveCsrfToken } from "../../lib/csrf";

const { createClientMock, verifyOtpMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const verifyOtpMock = vi.fn();
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { verifyOtp: verifyOtpMock },
    from: fromMock,
  }));
  return { createClientMock, verifyOtpMock, singleMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { verifyEmailHandler } from "./verifyEmail";

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
  app.post("/api/auth/verify-email", verifyEmailHandler);
  return app;
}

function post(body: object) {
  return createApp().request(
    "/api/auth/verify-email",
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

const VERIFIED_SESSION = {
  user: {
    id: "user-1",
    email: "taro@example.com",
    user_metadata: { name: "太郎" },
  },
  session: { access_token: "new-access-token", refresh_token: "new-refresh-token" },
};

describe("verifyEmailHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { role: null, username: null }, error: null });
  });

  it("正常系: verifyOtp成功で 200 verified を返し、user・csrf_token を含む", async () => {
    // 準備
    verifyOtpMock.mockResolvedValue({ data: VERIFIED_SESSION, error: null });

    // Act
    const res = await post({ token_hash: "valid-token-hash" });

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string; user: unknown; csrf_token: string }>();
    expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: "valid-token-hash",
      type: "signup",
    });
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

  it("正常系: access_token・refresh_token・csrf_secret を httpOnly Cookie としてセットする", async () => {
    // 準備
    verifyOtpMock.mockResolvedValue({ data: VERIFIED_SESSION, error: null });

    // Act
    const res = await post({ token_hash: "valid-token-hash" });

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
    // 準備
    verifyOtpMock.mockResolvedValue({ data: VERIFIED_SESSION, error: null });

    // Act
    const res = await post({ token_hash: "valid-token-hash" });
    const body = await res.json<{ csrf_token: string }>();
    const cookies = getSetCookies(res);
    const csrfCookie = cookies.find((c) => c.startsWith("csrf_secret="))!;
    const csrfSecret = csrfCookie.split(";")[0].split("=")[1];

    // Assert
    const expected = await deriveCsrfToken(csrfSecret, env.CSRF_HMAC_SECRET);
    expect(body.csrf_token).toBe(expected);
  });

  it("異常系: verifyOtp が失敗するとき 400 invalid_or_expired_token を返す（Cookie を発行しない）", async () => {
    // 準備
    verifyOtpMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Token has expired or is invalid" },
    });

    // Act
    const res = await post({ token_hash: "expired-token-hash" });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "failure",
      error: "invalid_or_expired_token",
    });
    const cookies = getSetCookies(res).filter((c) => c.length > 0);
    expect(cookies.length).toBe(0);
  });

  it("異常系: token_hash が欠けているとき Supabase を呼ばず 400 invalid_request を返す", async () => {
    // Act
    const res = await post({});

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "failure", error: "invalid_request" });
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
