import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import type { AuthUser } from "@shared/entities/AuthUser";
import { createAuthClient, createScopedClient } from "../../lib/supabaseClients";
import { setAuthCookies, setCsrfSecretCookie } from "../../lib/authCookies";
import { generateCsrfSecret, deriveCsrfToken } from "../../lib/csrf";
import { fetchUserProfile } from "../../lib/fetchUserProfile";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

type VerifyEmailBody = {
  token_hash?: unknown;
};

/**
 * `POST /api/auth/verify-email`。authMiddleware・csrfMiddleware いずれの対象外
 * （確認リンク着地直後はまだ access_token も csrf_secret も存在しない）。
 *
 * 確認済み＝本人のメール到達が証明された直後のため、signup.ts の verified 分岐と
 * 同じ Cookie 発行 + CSRF secret 発行を行い、そのままログイン状態にする。
 */
export async function verifyEmailHandler(c: HandlerContext) {
  const body = await c.req.json<VerifyEmailBody>().catch(() => ({}) as VerifyEmailBody);
  const { token_hash } = body;

  if (typeof token_hash !== "string") {
    return c.json({ status: "failure", error: "invalid_request" }, 400);
  }

  const supabase = createAuthClient(c.env);
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: "signup" });

  if (error || !data.session || !data.user) {
    return c.json({ status: "failure", error: "invalid_or_expired_token" }, 400);
  }

  const { session, user } = data;
  setAuthCookies(c, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  const csrfSecret = generateCsrfSecret();
  setCsrfSecretCookie(c, csrfSecret);
  const csrfToken = await deriveCsrfToken(csrfSecret, c.env.CSRF_HMAC_SECRET);

  const scoped = createScopedClient(c.env, session.access_token);
  const { role, username } = await fetchUserProfile(scoped, user.id);

  const authUser: AuthUser = {
    id: user.id,
    name: user.user_metadata.name,
    email: user.email,
    role,
    username,
  };

  return c.json({ status: "verified", user: authUser, csrf_token: csrfToken }, 200);
}
