// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { HonoVariables } from "@shared/types/hono";
import { deriveCsrfToken } from "../lib/csrf";
import { csrfMiddleware } from "./csrf";

const env = { CSRF_HMAC_SECRET: "hmac-secret" } as CloudflareBindings;

function createApp() {
  const app = new Hono<{
    Bindings: CloudflareBindings;
    Variables: HonoVariables;
  }>();
  app.use("/api/*", csrfMiddleware);
  app.post("/api/protected", (c) => c.json({ ok: true }));
  return app;
}

describe("csrfMiddleware", () => {
  it("正常系: csrf_secret Cookie と X-CSRF-Token ヘッダーが一致するとき通す", async () => {
    // 準備
    const app = createApp();
    const secret = "secret-1";
    const token = await deriveCsrfToken(secret, env.CSRF_HMAC_SECRET);

    // Act
    const res = await app.request(
      "/api/protected",
      {
        method: "POST",
        headers: { Cookie: `csrf_secret=${secret}`, "X-CSRF-Token": token },
      },
      env,
    );

    // Assert
    expect(res.status).toBe(200);
  });

  it("異常系: csrf_secret Cookie がないとき 403", async () => {
    // 準備
    const app = createApp();
    const token = await deriveCsrfToken("secret-1", env.CSRF_HMAC_SECRET);

    // Act
    const res = await app.request(
      "/api/protected",
      { method: "POST", headers: { "X-CSRF-Token": token } },
      env,
    );

    // Assert
    expect(res.status).toBe(403);
  });

  it("異常系: X-CSRF-Token ヘッダーがないとき 403", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request(
      "/api/protected",
      { method: "POST", headers: { Cookie: "csrf_secret=secret-1" } },
      env,
    );

    // Assert
    expect(res.status).toBe(403);
  });

  it("異常系: トークンが secret から再計算した値と不一致のとき 403", async () => {
    // 準備
    const app = createApp();

    // Act
    const res = await app.request(
      "/api/protected",
      {
        method: "POST",
        headers: { Cookie: "csrf_secret=secret-1", "X-CSRF-Token": "wrong-token" },
      },
      env,
    );

    // Assert
    expect(res.status).toBe(403);
  });
});
