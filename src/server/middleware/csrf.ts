import { createMiddleware } from "hono/factory";
import type { HonoVariables } from "@shared/types/hono";
import { getCsrfSecret } from "../lib/authCookies";
import { verifyCsrfToken } from "../lib/csrf";

/**
 * Signed Double-Submit Cookie 方式の CSRF 検証ミドルウェア。
 * `csrf_secret` httpOnly Cookie と `X-CSRF-Token` ヘッダーを HMAC 照合し、
 * 不一致・いずれか欠落なら 403。
 *
 * どのパス・メソッドに適用するか（除外リスト・状態変更メソッド限定）は
 * `routeGuards.ts` 側で判定する。このミドルウェア自体はパス/メソッドを見ない。
 */
export const csrfMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>(async (c, next) => {
  const secret = getCsrfSecret(c);
  const token = c.req.header("X-CSRF-Token");

  if (!secret || !token) {
    return c.json({ error: "csrf_failed" }, 403);
  }

  const valid = await verifyCsrfToken(secret, token, c.env.CSRF_HMAC_SECRET);
  if (!valid) {
    return c.json({ error: "csrf_failed" }, 403);
  }

  await next();
});
