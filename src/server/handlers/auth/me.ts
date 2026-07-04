import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import type { AuthUser } from "@shared/entities/AuthUser";
import { createScopedClient } from "../../lib/supabaseClients";
import { getAccessToken, getCsrfSecret } from "../../lib/authCookies";
import { deriveCsrfToken } from "../../lib/csrf";
import { fetchUserProfile } from "../../lib/fetchUserProfile";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

/**
 * `GET /api/auth/me`。authMiddleware 通過が前提（`c.get("user").id` は検証済み）。
 * csrfMiddleware の対象外（GET のため）。
 * リロード後も JS が csrf_token を再取得できるよう、`csrf_secret` Cookie から
 * `csrf_token` を再計算して返す。
 */
export async function meHandler(c: HandlerContext) {
  const userId = c.get("user").id;
  const csrfSecret = getCsrfSecret(c);
  if (!csrfSecret) {
    return c.json({}, 401);
  }

  // authMiddleware 通過済みのため access_token は必ず存在する
  const accessToken = getAccessToken(c)!;
  const supabase = createScopedClient(c.env, accessToken);

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return c.json({}, 401);
  }
  const user = userData.user;

  const { role, username } = await fetchUserProfile(supabase, userId);
  const csrfToken = await deriveCsrfToken(csrfSecret, c.env.CSRF_HMAC_SECRET);

  const authUser: AuthUser = {
    id: user.id,
    name: user.user_metadata.name,
    email: user.email,
    role,
    username,
  };

  return c.json({ user: authUser, csrf_token: csrfToken }, 200);
}
