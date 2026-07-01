// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";

// ── service_role Supabase クライアントモック ───────────────
// 2 つの読みを行う:
//   1. 対象 user の role:   from("profiles").select("role").eq("id", id).single()
//   2. admin 総数:          from("profiles").select("id").eq("role", "admin")  ← await（thenable）
// 削除:                     auth.admin.deleteUser(id)
const { createClientMock, singleMock, deleteUserMock, setAdminRows } = vi.hoisted(
  () => {
    let adminRows: { data: unknown[]; error: unknown } = { data: [], error: null };
    const singleMock = vi.fn();
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      single: singleMock,
      // admin 総数クエリは .single() を付けず await する（Supabase の query builder は thenable）
      then: (resolve: (v: unknown) => void) => resolve(adminRows),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const fromMock = vi.fn(() => chain);
    const deleteUserMock = vi.fn<
      () => Promise<{ data: unknown; error: { message: string } | null }>
    >(() => Promise.resolve({ data: {}, error: null }));
    const createClientMock = vi.fn((..._args: unknown[]) => ({
      from: fromMock,
      auth: { admin: { deleteUser: deleteUserMock } },
    }));
    return {
      createClientMock,
      singleMock,
      deleteUserMock,
      setAdminRows: (rows: unknown[]) => {
        adminRows = { data: rows, error: null };
      },
    };
  },
);

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { deleteUserHandler } from "./deleteUser";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
} as unknown as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.delete("/api/admin/users/:id", deleteUserHandler);
  return app;
}

async function del(id: string) {
  return createApp().request(`/api/admin/users/${id}`, { method: "DELETE" }, env);
}

describe("deleteUserHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAdminRows([{ id: "a-1" }, { id: "a-2" }]); // 既定: admin は複数いる
    deleteUserMock.mockResolvedValue({ data: {}, error: null });
  });

  it("正常系: 非 admin 対象を削除し 204 を返す", async () => {
    // 準備: 対象の role は staff
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    const res = await del("target-1");

    // Assert
    expect(res.status).toBe(204);
    expect(deleteUserMock).toHaveBeenCalledWith("target-1");
  });

  it("正常系: service_role key でクライアントを生成する", async () => {
    // 準備
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    await del("target-1");

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "service-role-secret",
    );
  });

  it("異常系: deleteUser が error を返したとき 500（error を握り潰さない）", async () => {
    // 準備: 対象は staff・削除で失敗
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });
    deleteUserMock.mockResolvedValue({ data: null, error: { message: "gotrue down" } });

    // Act
    const res = await del("target-1");

    // Assert
    expect(res.status).toBe(500);
  });

  it("異常系: 最後の admin を削除しようとしたとき 409・削除しない", async () => {
    // 準備: 対象は admin、admin は 1 人だけ
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    setAdminRows([{ id: "only-admin" }]);

    // Act
    const res = await del("only-admin");

    // Assert
    expect(res.status).toBe(409);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("正常系: admin 対象でも他に admin がいれば削除し 204", async () => {
    // 準備: 対象は admin、admin は 2 人
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    setAdminRows([{ id: "a-1" }, { id: "a-2" }]);

    // Act
    const res = await del("a-1");

    // Assert
    expect(res.status).toBe(204);
    expect(deleteUserMock).toHaveBeenCalledWith("a-1");
  });

  it("冪等: 対象が存在しないとき 204・削除を呼ばない", async () => {
    // 準備: 対象 role の取得で行なし
    singleMock.mockResolvedValue({ data: null, error: null });

    // Act
    const res = await del("ghost");

    // Assert
    expect(res.status).toBe(204);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });
});
