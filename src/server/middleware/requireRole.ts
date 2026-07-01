import { createMiddleware } from "hono/factory";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@shared/entities/UserRole";
import type { HonoVariables } from "@shared/types/hono";

/**
 * サーバーサイド RBAC ミドルウェア（Phase 3）。
 *
 * - authMiddleware の**後段**で実行される前提（`c.get("user").id` を使う）。
 * - caller の **user JWT + publishable key** で Supabase クライアントを作り、
 *   `profiles` から自分の `role` を 1 行だけ取得する。RLS `view_profiles`
 *   （`auth.uid() = id`）に絞り込みを委ね、service_role は使わない（最小権限）。
 * - role はカスタムクレームに焼かず毎回 DB から取得し、role 変更を即時反映する。
 * - 取得失敗・role 不在・`allowed` 外はすべて 403（fail-closed）。事由はサーバー
 *   ログに区別して残すが、レスポンスは一律 `Forbidden`（id 存在等の情報漏洩回避）。
 */
export function requireRole(allowed: UserRole[]) {
  return createMiddleware<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>(async (c, next) => {
    const userId = c.get("user").id;
    const token = c.req.header("Authorization")!.slice("Bearer ".length);

    const supabase = createClient(
      c.env.SUPABASE_URL,
      c.env.SUPABASE_PUBLISHABLE_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error || !data?.role) {
      console.warn("[requireRole] role 取得失敗または不在", userId, error?.message);
      return c.json({ error: "Forbidden" }, 403);
    }

    const role = data.role as UserRole;
    if (!allowed.includes(role)) {
      console.warn("[requireRole] 権限不足", userId, role);
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("user", { id: userId, role });
    await next();
  });
}
