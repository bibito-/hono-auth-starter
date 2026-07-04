import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * `supabase.auth.*`（signInWithPassword/signUp/refreshSession/signOut）専用のクライアント。
 * サーバー側でセッションを保持・自動更新する必要はない
 * （Cookie を通じた保持はこちら側で明示的に行うため）ので
 * `persistSession: false` / `autoRefreshToken: false` を明示する。
 */
export function createAuthClient(env: CloudflareBindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * caller の user JWT + publishable key でスコープした DB アクセス用クライアント。
 * `requireRole` と同じパターン（RLS にスコープを委ね、service_role は使わない）。
 */
export function createScopedClient(
  env: CloudflareBindings,
  accessToken: string,
): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
