import { createMiddleware } from "hono/factory";
import type { HonoVariables } from "@shared/types/hono";
import { authMiddleware } from "./auth";
import { csrfMiddleware } from "./csrf";

type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
};

/**
 * authMiddleware の適用除外パス。
 * ログイン前で有効な access_token が存在し得ないエンドポイントのみを列挙する
 * （login/signup は未ログイン、refresh は access_token 期限切れ前提で呼ばれる）。
 * forgot-password/reset-password/verify-email/resend-confirmation も同様に、
 * リンク着地直後や未ログイン状態から呼ばれるため access_token は存在し得ない。
 */
export const AUTH_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/resend-confirmation",
];

/**
 * csrfMiddleware の適用除外パス。
 * login/signup はログイン前で csrf_secret が存在し得ないため対象外。
 * forgot-password/reset-password/verify-email/resend-confirmation も同様に
 * csrf_secret が発行される前に呼ばれるため対象外。
 */
export const CSRF_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/resend-confirmation",
];

/** CSRF 検証は状態変更メソッドのみ対象（GET は対象外）。 */
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

/**
 * `/api/*` へ一括適用する authMiddleware のラッパー。
 * `AUTH_EXEMPT_PATHS` に含まれるパスは認証チェックをスキップする。
 */
export const authGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (AUTH_EXEMPT_PATHS.includes(c.req.path)) {
    await next();
    return;
  }
  return authMiddleware(c, next);
});

/**
 * `/api/*` へ一括適用する csrfMiddleware のラッパー。
 * 状態変更メソッド（POST/PATCH/DELETE）以外、および `CSRF_EXEMPT_PATHS` に
 * 含まれるパスは検証をスキップする。
 */
export const csrfGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (!STATE_CHANGING_METHODS.has(c.req.method) || CSRF_EXEMPT_PATHS.includes(c.req.path)) {
    await next();
    return;
  }
  return csrfMiddleware(c, next);
});
