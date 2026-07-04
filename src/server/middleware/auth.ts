import { createMiddleware } from "hono/factory";
import { decode, verify } from "hono/jwt";
import type { HonoVariables } from "@shared/types/hono";
import { getAccessToken } from "../lib/authCookies";

/**
 * Supabase の JWKS（ES256 公開鍵）をモジュール変数にキャッシュする。
 * TTL（1h）を超えた場合は再フェッチする。フォールバック（古いキャッシュ継続使用）は行わない。
 */
let cachedKeys: JsonWebKey[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

async function getJwks(supabaseUrl: string): Promise<JsonWebKey[]> {
  if (cachedKeys && Date.now() < cacheExpiresAt) return cachedKeys;
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JsonWebKey[] };
  cachedKeys = data.keys;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedKeys;
}

/** テスト用: キャッシュをリセットする */
export function __resetJwksCache(): void {
  cachedKeys = null;
  cacheExpiresAt = 0;
}

/**
 * ES256 / JWKS ベースの JWT 検証ミドルウェア。
 * - トークンは `access_token` httpOnly Cookie から取得する（Authorization ヘッダーは見ない）
 * - `hono/jwt` の verify() で署名と exp を検証
 * - aud === "authenticated" / role === "authenticated" を明示チェックし、
 *   anon / service_role トークンを弾く
 * - 検証成功時に `c.set("user", { id: sub })` で後続ハンドラーへ渡す
 */
export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>(async (c, next) => {
  const token = getAccessToken(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const keys = await getJwks(c.env.SUPABASE_URL);
    const { header } = decode(token);
    const jwk =
      keys.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid) ??
      keys[0];

    const payload = await verify(token, jwk, "ES256");

    if (
      payload.aud !== "authenticated" ||
      payload.role !== "authenticated" ||
      typeof payload.sub !== "string"
    ) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", { id: payload.sub });
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});
