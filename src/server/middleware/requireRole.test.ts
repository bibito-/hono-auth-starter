// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

// ── Supabase クライアントモック ──────────────────────────
// profiles から自分の role を取る: from("profiles").select("role").eq("id", id).single()
const { createClientMock, singleMock, fromMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: singleMock,
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const fromMock = vi.fn(() => chain);
  const createClientMock = vi.fn((..._args: unknown[]) => ({ from: fromMock }));
  return { createClientMock, singleMock, fromMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { requireRole } from "./requireRole";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
} as unknown as CloudflareBindings;

// authMiddleware の後段を模した最小アプリ。caller を固定し requireRole を適用する。
function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("user", { id: "caller-1" });
    await next();
  });
  app.use("/api/admin/*", requireRole(["admin"]));
  app.get("/api/admin/ping", (c) => c.json({ role: c.get("user").role }));
  return app;
}

const authHeader = { Cookie: "access_token=caller-jwt" };

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({ from: fromMock });
  });

  it("正常系: caller が admin のとき通過し user.role をセットする", async () => {
    // 準備: profiles.role が admin を返す
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    const app = createApp();

    // Act
    const res = await app.request("/api/admin/ping", { headers: authHeader }, env);

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "admin" });
  });

  it("異常系: caller が staff のとき 403", async () => {
    // 準備: profiles.role が staff を返す
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });
    const app = createApp();

    // Act
    const res = await app.request("/api/admin/ping", { headers: authHeader }, env);

    // Assert
    expect(res.status).toBe(403);
  });

  it("異常系: role 取得が error のとき 403（fail-closed）", async () => {
    // 準備: 取得失敗
    singleMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const app = createApp();

    // Act
    const res = await app.request("/api/admin/ping", { headers: authHeader }, env);

    // Assert
    expect(res.status).toBe(403);
  });

  it("異常系: role が不在（data null）のとき 403", async () => {
    // 準備: 行は取れたが role なし
    singleMock.mockResolvedValue({ data: null, error: null });
    const app = createApp();

    // Act
    const res = await app.request("/api/admin/ping", { headers: authHeader }, env);

    // Assert
    expect(res.status).toBe(403);
  });

  it("正常系: caller の JWT と publishable key で client を生成し service_role を使わない", async () => {
    // 準備
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    const app = createApp();

    // Act
    await app.request("/api/admin/ping", { headers: authHeader }, env);

    // Assert: publishable key + caller の Authorization ヘッダー
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "pk-test",
      { global: { headers: { Authorization: "Bearer caller-jwt" } } },
    );
    const passedKeys = createClientMock.mock.calls.map((call) => call[1]);
    expect(passedKeys).not.toContain("service-role-secret");
    // 自分の行のみ取得（RLS view_profiles に委ねる）
    expect(fromMock).toHaveBeenCalledWith("profiles");
  });
});
