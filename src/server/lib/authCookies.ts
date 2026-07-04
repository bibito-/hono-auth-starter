import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const CSRF_SECRET_COOKIE = "csrf_secret";

/**
 * 認証系 Cookie の共通属性。
 * - httpOnly: JS から一切読めない（XSS 対策の要）
 * - secure + sameSite=None: Vercel/CFW が別ドメインのため暫定的に必須
 * - Max-Age は指定しない（セッション Cookie。ブラウザを閉じたら消える）
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  path: "/",
} as const;

/** ログイン/サインアップ/リフレッシュ成功時に access_token・refresh_token をセットする */
export function setAuthCookies(
  c: HandlerContext,
  { access_token, refresh_token }: { access_token: string; refresh_token: string },
): void {
  setCookie(c, ACCESS_TOKEN_COOKIE, access_token, COOKIE_OPTIONS);
  setCookie(c, REFRESH_TOKEN_COOKIE, refresh_token, COOKIE_OPTIONS);
}

/** ログアウト時・refresh 失敗時に認証系 Cookie を全て削除する（fail-safe） */
export function clearAuthCookies(c: HandlerContext): void {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
  deleteCookie(c, REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
  deleteCookie(c, CSRF_SECRET_COOKIE, COOKIE_OPTIONS);
}

export function getAccessToken(c: HandlerContext): string | undefined {
  return getCookie(c, ACCESS_TOKEN_COOKIE);
}

export function getRefreshToken(c: HandlerContext): string | undefined {
  return getCookie(c, REFRESH_TOKEN_COOKIE);
}

/**
 * `csrf_secret` は authCookies が管理する Cookie 群の一部だが、setAuthCookies とは
 * 独立して発行し直す（login/signup/refresh のたびに新しい乱数を発行するため）。
 */
export function setCsrfSecretCookie(c: HandlerContext, secret: string): void {
  setCookie(c, CSRF_SECRET_COOKIE, secret, COOKIE_OPTIONS);
}

export function getCsrfSecret(c: HandlerContext): string | undefined {
  return getCookie(c, CSRF_SECRET_COOKIE);
}
