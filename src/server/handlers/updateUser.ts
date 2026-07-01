import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import type { UserRole } from "@shared/entities/UserRole";
import type { HonoVariables } from "@shared/types/hono";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

const VALID_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "staff",
  "temporary",
];

type UpdateBody = { username?: string; role?: UserRole };

/**
 * `PATCH /api/users/:id` ハンドラ。requireRole(["admin","manager"]) 通過後に実行される。
 *
 * - role 列は authenticated から REVOKE 済みのため、更新は **service_role** が唯一の経路。
 *   粗いロールゲートはルートで、design_1 の細かい権限マトリクスはここで強制する。
 * - 権限マトリクス（正典 = `.claude/migrations/user-management-design_1.md`）:
 *   - admin: 全対象・全 role 可。ただし最後の admin の降格は 409（不可逆＝システム管理不能）。
 *   - manager: 対象が admin → 403 / admin への昇格 → 403 / 自己編集 → 403。それ以外の非 admin は可。
 * - 監査は role が実際に変化したときのみ `event_logs` へ `actor_id=操作者` で明示 INSERT する。
 *   service_role では `auth.uid()`=NULL になりトリガーでは actor を残せないため（トリガーの
 *   UPDATE 分岐は本タスクで停止済み・二重記録なし）。
 */
export async function updateUserHandler(c: HandlerContext) {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Bad Request" }, 400);

  const body = await c.req.json<UpdateBody>().catch(() => null);
  if (!body) return c.json({ error: "Bad Request" }, 400);

  const { username, role } = body;

  // body にどちらのフィールドも無い → 400
  if (username === undefined && role === undefined) {
    return c.json({ error: "Bad Request" }, 400);
  }
  // role が列挙外 → 400
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return c.json({ error: "Bad Request" }, 400);
  }

  const admin = createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 対象の現在 role を取得（不在は 404）。
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();
  if (!target) return c.json({ error: "Not Found" }, 404);

  const caller = c.get("user");
  const targetRole = target.role as UserRole;

  // manager の越権を弾く（design_1）。事由はログに区別し、応答は一律 Forbidden。
  if (caller.role === "manager") {
    if (targetRole === "admin") {
      console.warn("[updateUser] manager が admin 対象を編集", caller.id, id);
      return c.json({ error: "Forbidden" }, 403);
    }
    if (id === caller.id) {
      console.warn("[updateUser] manager が自己編集", caller.id);
      return c.json({ error: "Forbidden" }, 403);
    }
    if (role === "admin") {
      console.warn("[updateUser] manager が admin へ昇格を試行", caller.id, id);
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  // 最後の admin の降格を止める（不可逆＝システム管理不能）。manager は admin 対象に
  // 到達できないため実質 admin caller のみ通る経路。
  if (targetRole === "admin" && role !== undefined && role !== "admin") {
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) {
      return c.json({ error: "最後の管理者は降格できません" }, 409);
    }
  }

  const updates: UpdateBody = {};
  if (username !== undefined) updates.username = username;
  if (role !== undefined) updates.role = role;

  const { error } = await admin.from("profiles").update(updates).eq("id", id);
  if (error) {
    console.error("[updateUser] 更新に失敗", id, error.message);
    return c.json({ error: "更新に失敗しました" }, 500);
  }

  // role が実際に変化したときのみ監査記録（username のみ変更は記録しない）。
  if (role !== undefined && role !== targetRole) {
    await admin.from("event_logs").insert({
      user_id: id,
      actor_id: caller.id,
      action: "UPDATE",
      old_role: targetRole,
      new_role: role,
    });
  }

  return c.body(null, 204);
}
