// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

const { createClientMock, resetPasswordForEmailMock } = vi.hoisted(() => {
  const resetPasswordForEmailMock = vi.fn<
    () => Promise<{ data: object; error: { message: string } | null }>
  >(() => Promise.resolve({ data: {}, error: null }));
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { resetPasswordForEmail: resetPasswordForEmailMock },
  }));
  return { createClientMock, resetPasswordForEmailMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { forgotPasswordHandler } from "./forgotPassword";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.post("/api/auth/forgot-password", forgotPasswordHandler);
  return app;
}

function post(body: object) {
  return createApp().request(
    "/api/auth/forgot-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("forgotPasswordHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 登録済みメールのとき resetPasswordForEmail を呼び 200 sent を返す", async () => {
    // Act
    const res = await post({ email: "taro@example.com" });

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "sent" });
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("taro@example.com");
  });

  it("異常系: 未登録メールで resetPasswordForEmail がエラーを返しても 200 sent を返す（列挙対策）", async () => {
    // 準備
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: {},
      error: { message: "User not found" },
    });

    // Act
    const res = await post({ email: "unknown@example.com" });

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "sent" });
  });

  it("異常系: email が欠けているとき Supabase を呼ばず 200 sent を返す", async () => {
    // Act
    const res = await post({});

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "sent" });
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });
});
