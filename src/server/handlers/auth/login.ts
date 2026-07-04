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

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

/**
 * `POST /api/auth/login`。Supabase 直叩き（`supabase.auth.signInWithPassword`）を
 * Hono 経由に置き換える。httpOnly Cookie の発行はサーバーでしかできないため、
 * ログイン成功時にここで `Set-Cookie`（access_token/refresh_token/csrf_secret）する。
 * authMiddleware・csrfMiddleware いずれの対象外（ログイン前に有効な access_token /
 * csrf_secret は存在し得ない）。
 */
export async function loginHandler(c: HandlerContext) {
  const body = await c.req.json<LoginBody>().catch(() => ({}) as LoginBody);
  const { email, password } = body;

  if (typeof email !== "string" || typeof password !== "string") {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const supabase = createAuthClient(c.env);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return c.json({ error: "invalid_credentials" }, 401);
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

  return c.json({ user: authUser, csrf_token: csrfToken }, 200);
}
