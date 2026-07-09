// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

const { createClientMock, resendMock } = vi.hoisted(() => {
  const resendMock = vi.fn<
    () => Promise<{ data: object; error: { message: string } | null }>
  >(() => Promise.resolve({ data: {}, error: null }));
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { resend: resendMock },
  }));
  return { createClientMock, resendMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { resendConfirmationHandler } from "./resendConfirmation";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.post("/api/auth/resend-confirmation", resendConfirmationHandler);
  return app;
}

function post(body: object) {
  return createApp().request(
    "/api/auth/resend-confirmation",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("resendConfirmationHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 未確認メールのとき resend を type=signup で呼び 200 sent を返す", async () => {
    // Act
    const res = await post({ email: "taro@example.com" });

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "sent" });
    expect(resendMock).toHaveBeenCalledWith({ type: "signup", email: "taro@example.com" });
  });

  it("異常系: resend がエラーを返しても 200 sent を返す（列挙対策）", async () => {
    // 準備
    resendMock.mockResolvedValueOnce({ data: {}, error: { message: "User not found" } });

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
    expect(resendMock).not.toHaveBeenCalled();
  });
});
