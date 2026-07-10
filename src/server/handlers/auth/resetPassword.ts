import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import { createAuthClient } from "../../lib/supabaseClients";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

type ResetPasswordBody = {
  token_hash?: unknown;
  password?: unknown;
};

/**
 * `POST /api/auth/reset-password`。authMiddleware・csrfMiddleware いずれの対象外
 * （リカバリーリンク着地直後はまだ access_token も csrf_secret も存在しない）。
 *
 * `verifyOtp` はレスポンスを返したクライアントインスタンス内部にも recovery
 * セッションを保持するが、暗黙の状態遷移に頼らず `setSession` で明示的に
 * 再スコープしてから `updateUser`・`signOut` を呼ぶ（logout.ts と同じパターン）。
 *
 * 成功時も **Cookie は発行しない**。`signOut({ scope: "global" })` は recovery
 * セッション自身を含む全 refresh token を失効させるため、そのままログイン状態には
 * できない（できてしまう設計なら global 失効の意図と矛盾する）。SPA はログイン画面へ
 * 誘導する。
 */
export async function resetPasswordHandler(c: HandlerContext) {
  const body = await c.req.json<ResetPasswordBody>().catch(() => ({}) as ResetPasswordBody);
  const { token_hash, password } = body;

  if (typeof token_hash !== "string" || typeof password !== "string") {
    return c.json({ status: "failure", error: "invalid_request" }, 400);
  }

  const supabase = createAuthClient(c.env);
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" });

  if (error || !data.session) {
    return c.json({ status: "failure", error: "invalid_or_expired_token" }, 400);
  }

  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return c.json({ status: "failure", error: updateError.message }, 400);
  }

  // 全 refresh token 失効を明示。暗黙挙動に頼らない（同一 spec の設計方針）。
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    console.error("[resetPassword] signOut に失敗", signOutError.message);
  }

  return c.json({ status: "reset" }, 200);
}
