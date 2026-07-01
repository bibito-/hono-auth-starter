// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, HonoVariables } from "@shared/types/hono";

// ── service_role Supabase クライアントモック ───────────────
// 読み: 1) 対象 role  from("profiles").select("role").eq("id",id).single()
//       2) admin 総数 from("profiles").select("id").eq("role","admin")  ← await(thenable)
// 書き: 3) 更新       from("profiles").update({...}).eq("id",id)        ← await
//       4) 監査       from("event_logs").insert({...})                 ← await
const {
  createClientMock,
  singleMock,
  updateEqMock,
  updateMock,
  insertMock,
  setAdminRows,
  setUpdateResult,
} = vi.hoisted(() => {
  let adminRows: { data: unknown[]; error: unknown } = { data: [], error: null };
  let updateResult: { error: unknown } = { error: null };
  const singleMock = vi.fn();
  const updateEqMock = vi.fn(() => Promise.resolve(updateResult));
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));
  const insertMock = vi.fn(() => Promise.resolve({ error: null }));
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: singleMock,
    update: updateMock,
    insert: insertMock,
    // admin 総数クエリは .single() を付けず await する（query builder は thenable）
    then: (resolve: (v: unknown) => void) => resolve(adminRows),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const fromMock = vi.fn(() => chain);
  const createClientMock = vi.fn((..._args: unknown[]) => ({ from: fromMock }));
  return {
    createClientMock,
    singleMock,
    updateEqMock,
    updateMock,
    insertMock,
    setAdminRows: (rows: unknown[]) => {
      adminRows = { data: rows, error: null };
    },
    setUpdateResult: (r: { error: unknown }) => {
      updateResult = r;
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { updateUserHandler } from "./updateUser";

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
  app.use("/api/users/*", async (c, next) => {
    c.set("user", caller);
    await next();
  });
  app.patch("/api/users/:id", updateUserHandler);
  return app;
}

async function patch(
  caller: AuthenticatedUser,
  id: string,
  body: Record<string, unknown>,
) {
  return createApp(caller).request(
    `/api/users/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

const ADMIN: AuthenticatedUser = { id: "admin-1", role: "admin" };
const MANAGER: AuthenticatedUser = { id: "manager-1", role: "manager" };

describe("updateUserHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAdminRows([{ id: "admin-1" }, { id: "admin-2" }]); // 既定: admin は複数
    setUpdateResult({ error: null });
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });
  });

  it("正常系: admin が staff→admin に変更し 204", async () => {
    // 準備: 対象は staff
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    const res = await patch(ADMIN, "target-1", { role: "admin" });

    // Assert
    expect(res.status).toBe(204);
    expect(updateMock).toHaveBeenCalledWith({ role: "admin" });
  });

  it("正常系: service_role key でクライアントを生成する", async () => {
    // Act
    await patch(ADMIN, "target-1", { username: "新名" });

    // Assert
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "service-role-secret",
    );
  });

  it("正常系: manager が staff→manager に変更し 204（design_1 で許可）", async () => {
    // 準備: 対象は staff
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    const res = await patch(MANAGER, "target-1", { role: "manager" });

    // Assert
    expect(res.status).toBe(204);
  });

  it("異常系: manager が staff→admin（昇格）は 403・更新しない", async () => {
    // 準備: 対象は staff
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    const res = await patch(MANAGER, "target-1", { role: "admin" });

    // Assert
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("異常系: manager が admin 対象を編集しようとして 403・更新しない", async () => {
    // 準備: 対象は admin
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });

    // Act
    const res = await patch(MANAGER, "target-admin", { username: "x" });

    // Assert
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("異常系: manager が自己編集しようとして 403・更新しない", async () => {
    // 準備: 対象は自分自身（manager）
    singleMock.mockResolvedValue({ data: { role: "manager" }, error: null });

    // Act
    const res = await patch(MANAGER, MANAGER.id, { username: "自分" });

    // Assert
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("異常系: 最後の admin を降格しようとして 409・更新しない", async () => {
    // 準備: 対象は admin、admin は 1 人だけ
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    setAdminRows([{ id: "only-admin" }]);

    // Act
    const res = await patch(ADMIN, "only-admin", { role: "staff" });

    // Assert
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("正常系: admin が複数いれば admin を降格でき 204", async () => {
    // 準備: 対象は admin、admin は 2 人
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    setAdminRows([{ id: "admin-1" }, { id: "admin-2" }]);

    // Act
    const res = await patch(ADMIN, "admin-2", { role: "staff" });

    // Assert
    expect(res.status).toBe(204);
  });

  it("異常系: 対象が存在しないとき 404・更新しない", async () => {
    // 準備: 対象 role の取得で行なし
    singleMock.mockResolvedValue({ data: null, error: null });

    // Act
    const res = await patch(ADMIN, "ghost", { role: "staff" });

    // Assert
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("異常系: body にフィールドが無いとき 400", async () => {
    // Act
    const res = await patch(ADMIN, "target-1", {});

    // Assert
    expect(res.status).toBe(400);
  });

  it("異常系: role が列挙外のとき 400", async () => {
    // Act
    const res = await patch(ADMIN, "target-1", { role: "superuser" });

    // Assert
    expect(res.status).toBe(400);
  });

  it("監査: role 変化時のみ event_logs に actor_id=caller で INSERT する", async () => {
    // 準備: 対象は staff → manager へ変更
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    await patch(ADMIN, "target-1", { role: "manager" });

    // Assert
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "target-1",
      actor_id: "admin-1",
      action: "UPDATE",
      old_role: "staff",
      new_role: "manager",
    });
  });

  it("監査: username のみ変更のとき event_logs に INSERT しない", async () => {
    // 準備: 対象は staff、username だけ変更
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });

    // Act
    await patch(ADMIN, "target-1", { username: "新名" });

    // Assert
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("異常系: 更新が DB エラーのとき 500", async () => {
    // 準備: 対象は staff、更新で失敗
    singleMock.mockResolvedValue({ data: { role: "staff" }, error: null });
    setUpdateResult({ error: { message: "db down" } });

    // Act
    const res = await patch(ADMIN, "target-1", { username: "x" });

    // Assert
    expect(res.status).toBe(500);
  });
});
