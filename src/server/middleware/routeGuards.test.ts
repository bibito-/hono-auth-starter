// @vitest-environment node
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { __resetJwksCache } from "./auth";
import { deriveCsrfToken } from "../lib/csrf";
import { authGuard, csrfGuard } from "./routeGuards";

const CSRF_HMAC_SECRET = "hmac-secret";
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  CSRF_HMAC_SECRET,
} as CloudflareBindings;

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

async function makeToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: "user-123", aud: "authenticated", role: "authenticated", exp: now + 3600 },
    privateKey,
    "ES256",
  );
}

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.use("/api/*", authGuard);
  app.use("/api/*", csrfGuard);
  app.post("/api/auth/login", (c) => c.json({ ok: "login" }));
  app.post("/api/auth/signup", (c) => c.json({ ok: "signup" }));
  app.post("/api/auth/refresh", (c) => c.json({ ok: "refresh" }));
  app.post("/api/auth/logout", (c) => c.json({ ok: "logout" }));
  app.get("/api/auth/me", (c) => c.json({ ok: "me" }));
  app.get("/api/users", (c) => c.json({ ok: "list" }));
  app.patch("/api/users/:id", (c) => c.json({ ok: "update" }));
  return app;
}

describe("authGuard", () => {
  it("正常系: /api/auth/login は access_token Cookie がなくても通す（認証対象外）", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/login", { method: "POST" }, env);

    // Assert
    expect(res.status).toBe(200);
  });

  it("正常系: /api/auth/signup は access_token Cookie がなくても通す（認証対象外）", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/signup", { method: "POST" }, env);

    // Assert
    expect(res.status).toBe(200);
  });

  it("正常系: /api/auth/refresh は access_token Cookie がなくても認証チェックを通す（csrf は別途必要）", async () => {
    // 準備: csrf は満たしておき、認証除外の効果だけを見る
    const app = createApp();
    const secret = "secret-1";
    const token = await deriveCsrfToken(secret, CSRF_HMAC_SECRET);

    // Act
    const res = await app.request(
      "/api/auth/refresh",
      { method: "POST", headers: { Cookie: `csrf_secret=${secret}`, "X-CSRF-Token": token } },
      env,
    );

    // Assert
    expect(res.status).toBe(200);
  });

  it("異常系: /api/auth/logout は access_token Cookie がないと 401（認証対象）", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/logout", { method: "POST" }, env);

    // Assert
    expect(res.status).toBe(401);
  });

  it("正常系: /api/auth/logout は有効な access_token + csrf があれば通す", async () => {
    // 準備
    const app = createApp();
    const accessToken = await makeToken();
    const csrfSecret = "secret-1";
    const csrfToken = await deriveCsrfToken(csrfSecret, CSRF_HMAC_SECRET);

    // Act
    const res = await app.request(
      "/api/auth/logout",
      {
        method: "POST",
        headers: {
          Cookie: `access_token=${accessToken}; csrf_secret=${csrfSecret}`,
          "X-CSRF-Token": csrfToken,
        },
      },
      env,
    );

    // Assert
    expect(res.status).toBe(200);
  });

  it("異常系: /api/auth/me は access_token Cookie がないと 401（認証対象）", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/me", { method: "GET" }, env);

    // Assert
    expect(res.status).toBe(401);
  });

  it("異常系: 既存の /api/users は access_token Cookie がないと 401（認証対象、除外なし）", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/users", { method: "GET" }, env);

    // Assert
    expect(res.status).toBe(401);
  });
});

describe("csrfGuard", () => {
  it("正常系: GET は csrf_secret / X-CSRF-Token がなくても対象外（me は 401 で先に落ちるため users で確認）", async () => {
    // 準備: 認証は満たし、CSRF を満たさない状態で GET を送る
    const app = createApp();
    const accessToken = await makeToken();

    // Act
    const res = await app.request(
      "/api/users",
      { method: "GET", headers: { Cookie: `access_token=${accessToken}` } },
      env,
    );

    // Assert: GET は csrfGuard の対象外なので 200 まで到達する
    expect(res.status).toBe(200);
  });

  it("異常系: PATCH /api/users/:id は csrf_secret / X-CSRF-Token がないと 403", async () => {
    // 準備: 認証は満たすが CSRF を満たさない
    const app = createApp();
    const accessToken = await makeToken();

    // Act
    const res = await app.request(
      "/api/users/user-1",
      { method: "PATCH", headers: { Cookie: `access_token=${accessToken}` } },
      env,
    );

    // Assert
    expect(res.status).toBe(403);
  });

  it("正常系: PATCH /api/users/:id は認証・CSRF 双方を満たせば 200", async () => {
    // 準備
    const app = createApp();
    const accessToken = await makeToken();
    const csrfSecret = "secret-1";
    const csrfToken = await deriveCsrfToken(csrfSecret, CSRF_HMAC_SECRET);

    // Act
    const res = await app.request(
      "/api/users/user-1",
      {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${accessToken}; csrf_secret=${csrfSecret}`,
          "X-CSRF-Token": csrfToken,
        },
      },
      env,
    );

    // Assert
    expect(res.status).toBe(200);
  });

  it("正常系: /api/auth/login（POST）は CSRF 検証対象外", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/login", { method: "POST" }, env);

    // Assert
    expect(res.status).toBe(200);
  });

  it("正常系: /api/auth/signup（POST）は CSRF 検証対象外", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/signup", { method: "POST" }, env);

    // Assert
    expect(res.status).toBe(200);
  });

  it("異常系: /api/auth/refresh（POST）は CSRF 検証対象（csrf なしで 403）", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request("/api/auth/refresh", { method: "POST" }, env);

    // Assert
    expect(res.status).toBe(403);
  });
});
