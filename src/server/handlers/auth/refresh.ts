import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import { createAuthClient } from "../../lib/supabaseClients";
import { setAuthCookies, setCsrfSecretCookie, clearAuthCookies, getRefreshToken } from "../../lib/authCookies";
import { generateCsrfSecret, deriveCsrfToken } from "../../lib/csrf";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

/**
 * `POST /api/auth/refresh`（ボディなし。refresh_token Cookie を使う）。
 * access_token が期限切れの状態で呼ばれるのが前提のため authMiddleware の対象外。
 * csrfMiddleware の対象（状態変更操作のため）。
 */
export async function refreshHandler(c: HandlerContext) {
  const refreshToken = getRefreshToken(c);
  if (!refreshToken) {
    return c.json({}, 401);
  }

  const supabase = createAuthClient(c.env);
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    clearAuthCookies(c);
    return c.json({}, 401);
  }

  setAuthCookies(c, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  const csrfSecret = generateCsrfSecret();
  setCsrfSecretCookie(c, csrfSecret);
  const csrfToken = await deriveCsrfToken(csrfSecret, c.env.CSRF_HMAC_SECRET);

  return c.json({ csrf_token: csrfToken }, 200);
}
