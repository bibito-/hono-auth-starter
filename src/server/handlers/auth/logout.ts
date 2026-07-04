import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import { createAuthClient } from "../../lib/supabaseClients";
import { clearAuthCookies, getAccessToken, getRefreshToken } from "../../lib/authCookies";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

/**
 * `POST /api/auth/logout`。authMiddleware・csrfMiddleware の対象。
 * Supabase 側の signOut 呼び出し結果に関わらず、必ず clearAuthCookies する
 * （fail-safe。Supabase 側が失敗してもブラウザ側の Cookie は必ず消す）。
 */
export async function logoutHandler(c: HandlerContext) {
  const accessToken = getAccessToken(c);
  const refreshToken = getRefreshToken(c);

  if (accessToken && refreshToken) {
    try {
      const supabase = createAuthClient(c.env);
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[logout] signOut に失敗", error.message);
      }
    } catch (e) {
      console.error("[logout] signOut に失敗", e instanceof Error ? e.message : String(e));
    }
  }

  clearAuthCookies(c);
  return c.json({}, 200);
}
