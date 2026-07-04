// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((..._args: unknown[]) => ({})),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { createAuthClient, createScopedClient } from "./supabaseClients";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
} as unknown as CloudflareBindings;

describe("createAuthClient", () => {
  it("正常系: publishable key + persistSession/autoRefreshToken 無効でクライアントを生成する", () => {
    // Act
    createAuthClient(env);

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "pk-test",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const passedKeys = createClientMock.mock.calls.map((call) => call[1]);
    expect(passedKeys).not.toContain("service-role-secret");
  });
});

describe("createScopedClient", () => {
  it("正常系: publishable key + Authorization ヘッダー（caller の access_token）でクライアントを生成する", () => {
    // Act
    createScopedClient(env, "user-access-token");

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "pk-test",
      { global: { headers: { Authorization: "Bearer user-access-token" } } },
    );
    const passedKeys = createClientMock.mock.calls.map((call) => call[1]);
    expect(passedKeys).not.toContain("service-role-secret");
  });
});
