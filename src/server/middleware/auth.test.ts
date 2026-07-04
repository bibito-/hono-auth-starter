// @vitest-environment node
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { __resetJwksCache, authMiddleware } from "./auth";

// ── ES256 鍵ペア（テスト全体で共有）──────────────────────
// JWKS エンドポイントが返す公開鍵と、トークン署名に使う秘密鍵を用意する
let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { kid?: string };

beforeEach(async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  privateKey = keyPair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  publicJwk.kid = "test-key";

  // JWKS エンドポイントのレスポンスをモックする
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  __resetJwksCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const env = { SUPABASE_URL: "https://test.supabase.co" } as CloudflareBindings;

// テスト用のトークンを生成する
async function makeToken(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: "user-123",
      aud: "authenticated",
      role: "authenticated",
      exp: now + 3600,
      ...overrides,
    },
    privateKey,
    "ES256",
  );
}

// authMiddleware を適用した最小アプリを組み立てる
function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.use("/api/*", authMiddleware);
  app.get("/api/me", (c) => c.json({ id: c.get("user").id }));
  return app;
}

describe("authMiddleware", () => {
  it("正常系: access_token Cookie が有効なとき user.id に sub を設定して通す", async () => {
    // 準備
    const app = createApp();
    const token = await makeToken();

    // Act
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}` } },
      env,
    );

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-123" });
  });

  it("異常系: access_token Cookie がないとき 401", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/me", {}, env);

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: access_token Cookie が空文字のとき 401", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: "access_token=" } },
      env,
    );

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: 署名が不正なとき 401", async () => {
    // 準備
    const app = createApp();
    const token = await makeToken();

    // Act: 末尾を改ざんして署名を壊す
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}tampered` } },
      env,
    );

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: aud が authenticated でないとき 401", async () => {
    // 準備
    const app = createApp();
    const token = await makeToken({ aud: "anon" });

    // Act
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}` } },
      env,
    );

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: role が authenticated でないとき 401", async () => {
    // 準備
    const app = createApp();
    const token = await makeToken({ role: "service_role" });

    // Act
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}` } },
      env,
    );

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: 有効期限切れのとき 401", async () => {
    // 準備
    const app = createApp();
    const now = Math.floor(Date.now() / 1000);
    const token = await makeToken({ exp: now - 10 });

    // Act
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}` } },
      env,
    );

    // Assert
    expect(res.status).toBe(401);
  });

  it("JWKS はキャッシュされ、複数リクエストでも fetch は1回のみ", async () => {
    // 準備
    const app = createApp();
    const token = await makeToken();

    // Act: 同じインスタンスに2回リクエストする
    await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}` } },
      env,
    );
    await app.request(
      "/api/me",
      { headers: { Cookie: `access_token=${token}` } },
      env,
    );

    // Assert
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe("JWKS キャッシュ TTL", () => {
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
    const T0 = 1_700_000_000_000; // 固定基準時刻（ms）

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("TTL 内は fetch を再フェッチしない", async () => {
      // 準備
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(T0);
      const app = createApp();
      // T0 + 2h で期限切れにならないよう exp を長めにとる
      const token = await makeToken({ exp: Math.floor(T0 / 1000) + 7200 });
      // 1回目リクエストでキャッシュを作る
      await app.request(
        "/api/me",
        { headers: { Cookie: `access_token=${token}` } },
        env,
      );
      // TTL 内（TTL - 1ms）に進める
      nowSpy.mockReturnValue(T0 + CACHE_TTL_MS - 1);

      // Act
      await app.request(
        "/api/me",
        { headers: { Cookie: `access_token=${token}` } },
        env,
      );

      // Assert
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("TTL 切れ後は fetch を再呼び出しする", async () => {
      // 準備
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(T0);
      const app = createApp();
      // T0 + 2h で期限切れにならないよう exp を長めにとる
      const token = await makeToken({ exp: Math.floor(T0 / 1000) + 7200 });
      // 1回目リクエストでキャッシュを作る
      await app.request(
        "/api/me",
        { headers: { Cookie: `access_token=${token}` } },
        env,
      );
      // TTL を超える（TTL + 1ms）
      nowSpy.mockReturnValue(T0 + CACHE_TTL_MS + 1);

      // Act
      await app.request(
        "/api/me",
        { headers: { Cookie: `access_token=${token}` } },
        env,
      );

      // Assert
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("TTL 切れ後のフェッチ失敗時は 401 を返す（フォールバックなし）", async () => {
      // 準備
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(T0);
      const app = createApp();
      // T0 + 2h で期限切れにならないよう exp を長めにとる
      const token = await makeToken({ exp: Math.floor(T0 / 1000) + 7200 });
      // 1回目リクエストでキャッシュを作る
      await app.request(
        "/api/me",
        { headers: { Cookie: `access_token=${token}` } },
        env,
      );
      // TTL を超えて fetch を失敗させる
      nowSpy.mockReturnValue(T0 + CACHE_TTL_MS + 1);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 500 })),
      );

      // Act
      const res = await app.request(
        "/api/me",
        { headers: { Cookie: `access_token=${token}` } },
        env,
      );

      // Assert
      expect(res.status).toBe(401);
    });
  });
});
