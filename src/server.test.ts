// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { corsMiddleware, LOCAL_ORIGINS } from "./server/cors";
import { authGuard, csrfGuard } from "./server/middleware/routeGuards";
import { bodySizeLimitMiddleware } from "./server/middleware/bodySize";

// 実 server.ts は RateLimiter 経由で `cloudflare:` を import するため node の
// ESM ローダーで読めない。auth.test.ts と同様に、server.ts の `/api/*` 配線
// （bodySize → cors → authGuard → csrfGuard の順）を最小アプリで再現して検証する。
const ALLOWED_ORIGIN = LOCAL_ORIGINS[0];
const DISALLOWED_ORIGIN = "https://evil.example.com";
const DUMMY_PROD_ORIGIN = "https://test-prod.example.com";

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  // server.ts と同じ順序: bodySize → cors → authGuard → csrfGuard
  app.use("/api/*", bodySizeLimitMiddleware);
  app.use("/api/*", corsMiddleware);
  app.use("/api/*", authGuard);
  app.use("/api/*", csrfGuard);
  app.get("/api/users", (c) => c.json({ ok: true }));
  return app;
}

describe("ボディサイズ制限 (/api/*)", () => {
  it("Content-Length が 64KB 以下のとき次のミドルウェアに通す", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: 64KB ちょうどの Content-Length を持つリクエスト
    const res = await app.request("/api/users", {
      method: "GET",
      headers: { "Content-Length": String(1024 * 64) },
    });

    // Assert: bodySizeLimitMiddleware は通過し、authGuard が 401 を返す
    expect(res.status).toBe(401);
  });

  it("Content-Length が 64KB 超のとき 413 を返す", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: 64KB + 1 バイトの Content-Length を持つリクエスト
    const res = await app.request("/api/users", {
      method: "GET",
      headers: { "Content-Length": String(1024 * 64 + 1) },
    });

    // Assert: 413 Payload Too Large が返る
    expect(res.status).toBe(413);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Payload Too Large");
  });

  it("Content-Length ヘッダーがないとき次のミドルウェアに通す", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: Content-Length ヘッダーなしのリクエスト
    const res = await app.request("/api/users", {
      method: "GET",
    });

    // Assert: bodySizeLimitMiddleware は通過し、authGuard が 401 を返す
    expect(res.status).toBe(401);
  });
});

describe("CORS (/api/*)", () => {
  it("許可オリジンのプリフライトに ACAO と許可メソッド/ヘッダーを返す", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: 許可オリジンからのプリフライト OPTIONS
    const res = await app.request("/api/users", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });

    // Assert
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Allow-Methods") ?? "").toContain(
      "GET",
    );
    const headers = res.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(headers).toContain("Authorization");
    expect(headers).toContain("Content-Type");
    expect(headers).toContain("X-CSRF-Token");
  });

  it("列挙した全ての許可オリジンを反射する", async () => {
    // 準備
    const app = createApp();

    // Act / Assert: LOCAL_ORIGINS の各オリジンが ACAO に反射されること
    for (const origin of LOCAL_ORIGINS) {
      const res = await app.request("/api/users", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
      });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });

  it("PROD_VERCEL_ORIGIN が c.env に設定されている場合、そのオリジンを反射する", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: PROD_VERCEL_ORIGIN をダミー本番オリジンで設定した env でプリフライト
    const res = await app.request(
      "/api/users",
      {
        method: "OPTIONS",
        headers: {
          Origin: DUMMY_PROD_ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      },
      { PROD_VERCEL_ORIGIN: DUMMY_PROD_ORIGIN } as unknown as CloudflareBindings,
    );

    // Assert: ACAO にダミー本番オリジンが反射される
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(DUMMY_PROD_ORIGIN);
  });

  it("PROD_VERCEL_ORIGIN が c.env に未設定（空文字列）の場合、本番オリジンを反射しない", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: PROD_VERCEL_ORIGIN を空文字列（未設定相当）にした env でプリフライト
    const res = await app.request(
      "/api/users",
      {
        method: "OPTIONS",
        headers: {
          Origin: DUMMY_PROD_ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      },
      { PROD_VERCEL_ORIGIN: "" } as unknown as CloudflareBindings,
    );

    // Assert: ACAO が付与されない（拒否）
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("PREVIEW_ORIGIN_PATTERN が null の既定設定では、vercel.app オリジンも許可しない", async () => {
    // 準備: 最小アプリを組み立てる
    const app = createApp();

    // Act: Vercel プレビュー URL 風のオリジンからのプリフライト
    const res = await app.request("/api/users", {
      method: "OPTIONS",
      headers: {
        Origin: "https://hono-auth-starter-abc123-some-team.vercel.app",
        "Access-Control-Request-Method": "GET",
      },
    });

    // Assert: PREVIEW_ORIGIN_PATTERN が null（既定）なので ACAO は付与されない
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("非許可オリジンのプリフライトには ACAO を返さない", async () => {
    // 準備
    const app = createApp();

    // Act: 許可リスト外オリジンからのプリフライト
    const res = await app.request("/api/users", {
      method: "OPTIONS",
      headers: {
        Origin: DISALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });

    // Assert
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("プリフライト OPTIONS は authGuard で 401 にならない（cors が先に短絡）", async () => {
    // 準備
    const app = createApp();

    // Act: Cookie なしの許可オリジンプリフライト
    const res = await app.request("/api/users", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });

    // Assert: cors が 204 で短絡し auth に到達しない
    expect(res.status).toBe(204);
  });

  it("実リクエストにも CORS ヘッダーが付く（cors は auth より前に実行）", async () => {
    // 準備
    const app = createApp();

    // Act: Cookie なしの許可オリジン実リクエスト（authGuard で 401 になる）
    const res = await app.request("/api/users", {
      method: "GET",
      headers: { Origin: ALLOWED_ORIGIN },
    });

    // Assert: authGuard で 401 だが、cors が先に走り ACAO は付与されている
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  });
});
