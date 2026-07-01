import { supabase } from "../clients/supabaseClient";

/**
 * Hono API を呼ぶための fetch ラッパー。
 * fetch 直前に getSession() を呼び（期限切れ間際の自動 refresh 対応）、
 * セッションがあれば Authorization: Bearer ヘッダーを自動付与する。
 * 今後の Hono API 呼び出しはすべてここを経由させる。
 *
 * Vercel(SPA) と Worker(API) が別オリジンになる本番では、相対パスでは
 * SPA 自身のオリジンに飛んでしまうため、VITE_API_BASE_URL を前置して
 * 絶対 URL 化する。未設定時（統合 dev / 段階カットオーバー中）は相対パスのまま動かす。
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  const url = typeof input === "string" ? `${base}${input}` : input;

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return response;
}
