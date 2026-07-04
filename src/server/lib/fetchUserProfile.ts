import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@shared/entities/UserRole";

export type UserProfile = {
  role: UserRole | null;
  username: string | null;
};

/**
 * `profiles` から呼び出し元自身の role/username を取得する。
 * `requireRole` と同じパターン（caller の user JWT + publishable key で作った
 * `supabase` を渡す。RLS `view_profiles`（auth.uid() = id）に絞り込みを委ねる）。
 *
 * login/signup/me の 3 箇所で使う共通ヘルパー。取得失敗時は例外にせず
 * `{ role: null, username: null }` にフォールバックする（プロフィール未生成の
 * 過渡状態でも認証フロー自体は継続させるため）。
 */
export async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.warn("[fetchUserProfile] profile 取得失敗または不在", userId, error?.message);
    return { role: null, username: null };
  }

  return {
    role: (data.role as UserRole) ?? null,
    username: (data.username as string | null) ?? null,
  };
}
