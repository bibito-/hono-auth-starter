import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

/**
 * `DELETE /api/admin/users/:id` ハンドラ。requireRole(["admin"]) 通過後に実行される。
 *
 * - service_role client で `auth.admin.deleteUser` を**単一実行**。profiles は
 *   FK `ON DELETE CASCADE` に委ね、孤児を作らない原子的削除にする。
 * - 「最後の admin」ガードはサーバー側が本丸（client チェックは API 直叩きで回避可能）。
 *   対象が admin かつ admin 総数 ≤ 1 なら 409 で不可逆操作を止める。
 * - 対象不在は存在判定を足さず冪等 204（id 存在の情報漏洩回避・単純性）。
 * - `deleteUser` の `error` は必ず判定し、失敗は 500（旧 Edge Function の握り潰しバグの修正）。
 */
export async function deleteUserHandler(c: HandlerContext) {
  // ルート定義上 :id は常に存在するが、型を string に確定させるため明示ガード。
  const id = c.req.param("id");
  if (!id) return c.json({ error: "id is required" }, 400);

  const admin = createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 対象の role を取得。行が無ければ冪等に 204（削除すべきものがない）。
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();
  if (!target) return c.body(null, 204);

  // 最後の admin を消すとシステム管理不能になる不可逆操作 → 409 で止める。
  if (target.role === "admin") {
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) {
      return c.json({ error: "最後の管理者は削除できません" }, 409);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("[deleteUser] 削除に失敗", id, error.message);
    return c.json({ error: "削除に失敗しました" }, 500);
  }

  return c.body(null, 204);
}
