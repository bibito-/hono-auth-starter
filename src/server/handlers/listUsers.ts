import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import { getAccessToken } from "../lib/authCookies";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

/**
 * `GET /api/users` ハンドラ。requireRole(["admin","manager"]) 通過後に実行される。
 *
 * - read は RLS をバイパスする理由がないため **service_role を使わない**。caller の
 *   user JWT + publishable key で `createClient` し、`requireRole` の入口ゲートに加えて
 *   RLS（admin/manager=全件・他=自分のみ）を 2 枚目の防御として効かせる。
 * - `select("*")` の生露出をやめ、必要列のみを DB 行形（snake_case）で返す。
 *   クライアントは既存 `mapToProfile` でマッピングを継続する。
 */
export async function listUsersHandler(c: HandlerContext) {
  const token = getAccessToken(c)!;

  const supabase = createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_PUBLISHABLE_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, email, updated_at")
    .order("updated_at", { ascending: true });

  if (error) {
    console.error("[listUsers] 取得に失敗", error.message);
    return c.json({ error: "取得に失敗しました" }, 500);
  }

  return c.json(data ?? [], 200);
}
