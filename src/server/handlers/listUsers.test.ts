// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, HonoVariables } from "@shared/types/hono";

// ── caller JWT + publishable key の Supabase クライアントモック ──
// 読み: from("profiles").select(列).order("updated_at", asc) を await（query builder は thenable）
const { createClientMock, selectMock, orderMock, setRows } = vi.hoisted(() => {
  let rows: { data: unknown; error: unknown } = { data: [], error: null };
  const orderMock = vi.fn(() => Promise.resolve(rows));
  const selectMock = vi.fn(() => ({ order: orderMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const createClientMock = vi.fn((..._args: unknown[]) => ({ from: fromMock }));
  return {
    createClientMock,
    selectMock,
    orderMock,
    setRows: (r: { data: unknown; error: unknown }) => {
      rows = r;
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { listUsersHandler } from "./listUsers";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
} as unknown as CloudflareBindings;

function createApp(caller: AuthenticatedUser) {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  // requireRole 通過後を模す: caller を固定してハンドラへ
  app.use("/api/users", async (c, next) => {
    c.set("user", caller);
    await next();
  });
  app.get("/api/users", listUsersHandler);
  return app;
}

async function get(caller: AuthenticatedUser, token = "caller-jwt") {
  return createApp(caller).request(
    "/api/users",
    { method: "GET", headers: { Cookie: `access_token=${token}` } },
    env,
  );
}

const ADMIN: AuthenticatedUser = { id: "admin-1", role: "admin" };

describe("listUsersHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRows({
      data: [
        { id: "u-1", username: "a", role: "staff", email: "a@x.com", updated_at: "2026-01-01" },
      ],
      error: null,
    });
  });

  it("正常系: 200 で profiles 行配列を返す", async () => {
    // Act
    const res = await get(ADMIN);

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "u-1", username: "a", role: "staff", email: "a@x.com", updated_at: "2026-01-01" },
    ]);
  });

  it("正常系: caller の Bearer + publishable key でクライアントを生成する（service_role を使わない）", async () => {
    // Act
    await get(ADMIN, "caller-jwt");

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "pk-test",
      { global: { headers: { Authorization: "Bearer caller-jwt" } } },
    );
  });

  it("正常系: 必要列のみを select し updated_at 昇順で並べる", async () => {
    // Act
    await get(ADMIN);

    // Assert
    expect(selectMock).toHaveBeenCalledWith("id, username, role, email, updated_at");
    expect(orderMock).toHaveBeenCalledWith("updated_at", { ascending: true });
  });

  it("正常系: data が null のとき空配列を返す", async () => {
    // 準備: data null（行なし）
    setRows({ data: null, error: null });

    // Act
    const res = await get(ADMIN);

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("異常系: DB エラーのとき 500", async () => {
    // 準備: select でエラー
    setRows({ data: null, error: { message: "db down" } });

    // Act
    const res = await get(ADMIN);

    // Assert
    expect(res.status).toBe(500);
  });
});
