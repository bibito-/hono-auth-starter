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

type SignupBody = {
  email?: unknown;
  password?: unknown;
};

/**
 * `POST /api/auth/signup`。`supabase.auth.signUp` の結果を 3 パターンに分岐する:
 * - `data.user.identities.length === 0`: 既に登録済みメールアドレス → 400 failure
 * - `data.session == null`: メール確認が有効なため即セッションが張られない → 200 pending
 * - それ以外: 即セッションが張られた（メール確認無効時）→ login と同様に Cookie 発行
 *
 * login/signup いずれも authMiddleware・csrfMiddleware の対象外。
 */
export async function signupHandler(c: HandlerContext) {
  const body = await c.req.json<SignupBody>().catch(() => ({}) as SignupBody);
  const { email, password } = body;

  if (typeof email !== "string" || typeof password !== "string") {
    return c.json({ status: "failure", error: "invalid_request" }, 400);
  }

  const supabase = createAuthClient(c.env);
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return c.json({ status: "failure", error: error.message }, 400);
  }

  if (data.user?.identities?.length === 0) {
    return c.json({ status: "failure", error: "account_exists" }, 400);
  }

  // メール確認が有効な場合、data.session は null になる
  if (data.session == null) {
    return c.json({ status: "pending" }, 200);
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
  const { role, username } = await fetchUserProfile(scoped, user!.id);

  const authUser: AuthUser = {
    id: user!.id,
    name: user!.user_metadata.name,
    email: user!.email,
    role,
    username,
  };

  return c.json({ status: "verified", user: authUser, csrf_token: csrfToken }, 200);
}
