// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

const { createClientMock, verifyOtpMock, setSessionMock, updateUserMock, signOutMock } =
  vi.hoisted(() => {
    const verifyOtpMock = vi.fn();
    const setSessionMock = vi.fn(() => Promise.resolve({ error: null }));
    const updateUserMock = vi.fn<
      () => Promise<{ data: object; error: { message: string } | null }>
    >(() => Promise.resolve({ data: {}, error: null }));
    const signOutMock = vi.fn<
      (options?: { scope: string }) => Promise<{ error: { message: string } | null }>
    >(() => Promise.resolve({ error: null }));
    const createClientMock = vi.fn((..._args: unknown[]) => ({
      auth: {
        verifyOtp: verifyOtpMock,
        setSession: setSessionMock,
        updateUser: updateUserMock,
        signOut: signOutMock,
      },
    }));
    return { createClientMock, verifyOtpMock, setSessionMock, updateUserMock, signOutMock };
  });

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { resetPasswordHandler } from "./resetPassword";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.post("/api/auth/reset-password", resetPasswordHandler);
  return app;
}

function post(body: object) {
  return createApp().request(
    "/api/auth/reset-password",
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

const RECOVERY_SESSION = {
  session: { access_token: "recovery-access-token", refresh_token: "recovery-refresh-token" },
  user: { id: "user-1", email: "taro@example.com" },
};

describe("resetPasswordHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyOtpMock.mockResolvedValue({ data: RECOVERY_SESSION, error: null });
  });

  it("正常系: verifyOtp成功→updateUser→signOut(global) の順で呼ばれ 200 reset を返す", async () => {
    // Act
    const res = await post({ token_hash: "valid-token-hash", password: "new-password123" });

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "reset" });
    expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: "valid-token-hash",
      type: "recovery",
    });
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "recovery-access-token",
      refresh_token: "recovery-refresh-token",
    });
    expect(updateUserMock).toHaveBeenCalledWith({ password: "new-password123" });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "global" });
  });

  it("正常系: Cookie を発行しない（global 失効するためログイン状態にしない）", async () => {
    // Act
    const res = await post({ token_hash: "valid-token-hash", password: "new-password123" });

    // Assert
    const cookies = getSetCookies(res).filter((c) => c.length > 0);
    expect(cookies.length).toBe(0);
  });

  it("異常系: verifyOtp が失敗するとき 400 invalid_or_expired_token を返す（updateUser を呼ばない）", async () => {
    // 準備
    verifyOtpMock.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Token has expired or is invalid" },
    });

    // Act
    const res = await post({ token_hash: "expired-token-hash", password: "new-password123" });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "failure",
      error: "invalid_or_expired_token",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("異常系: updateUser がパスワード強度エラーを返すとき 400 で error.message を返す", async () => {
    // 準備
    updateUserMock.mockResolvedValueOnce({
      data: {},
      error: { message: "Password should be at least 6 characters" },
    });

    // Act
    const res = await post({ token_hash: "valid-token-hash", password: "123" });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "failure",
      error: "Password should be at least 6 characters",
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("異常系: token_hash が欠けているとき Supabase を呼ばず 400 invalid_request を返す", async () => {
    // Act
    const res = await post({ password: "new-password123" });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "failure", error: "invalid_request" });
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("異常系: password が欠けているとき Supabase を呼ばず 400 invalid_request を返す", async () => {
    // Act
    const res = await post({ token_hash: "valid-token-hash" });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "failure", error: "invalid_request" });
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
