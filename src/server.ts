import { Hono } from "hono";
import { requireRole } from "./server/middleware/requireRole";
import { corsMiddleware } from "./server/cors";
import { bodySizeLimitMiddleware } from "./server/middleware/bodySize";
import { authGuard, csrfGuard } from "./server/middleware/routeGuards";
import { deleteUserHandler } from "./server/handlers/deleteUser";
import { listUsersHandler } from "./server/handlers/listUsers";
import { updateUserHandler } from "./server/handlers/updateUser";
import { loginHandler } from "./server/handlers/auth/login";
import { signupHandler } from "./server/handlers/auth/signup";
import { refreshHandler } from "./server/handlers/auth/refresh";
import { logoutHandler } from "./server/handlers/auth/logout";
import { meHandler } from "./server/handlers/auth/me";
import { forgotPasswordHandler } from "./server/handlers/auth/forgotPassword";
import { resetPasswordHandler } from "./server/handlers/auth/resetPassword";
import { verifyEmailHandler } from "./server/handlers/auth/verifyEmail";
import { resendConfirmationHandler } from "./server/handlers/auth/resendConfirmation";
import type { HonoVariables } from "@shared/types/hono";
import { RateLimiter } from "./server/rate-limit/RateLimiter";

export { RateLimiter };

const app = new Hono<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>();

// bodySize は cors・auth より前に置く。巨大ペイロードを後続処理に渡さないようにする。
app.use("/api/*", bodySizeLimitMiddleware);
// cors は auth より前に置く。OPTIONS プリフライトを cors が 204 で短絡させ、
// Cookie 未送信のプリフライトが authGuard で 401 になるのを防ぐ。
app.use("/api/*", corsMiddleware);
// authGuard: /api/auth/login・signup・refresh を除き authMiddleware（Cookie の
// access_token 検証）を適用する。ログイン前は有効な access_token が存在し得ないため、
// これらのパスを認証必須にすると誰もログインできなくなる。
app.use("/api/*", authGuard);
// csrfGuard: 状態変更メソッド（POST/PATCH/DELETE）にのみ csrfMiddleware を適用する。
// login・signup は csrf_secret がまだ発行されていないため対象外。
app.use("/api/*", csrfGuard);

// 認証プロキシ（Supabase 直叩きから Hono 経由に切り替え）。
// httpOnly Cookie の発行（Set-Cookie）はサーバーでしかできないため、
// login/signup/refresh 成功時にここで Cookie を発行する。
app.post("/api/auth/login", loginHandler);
app.post("/api/auth/signup", signupHandler);
app.post("/api/auth/refresh", refreshHandler);
app.post("/api/auth/logout", logoutHandler);
app.get("/api/auth/me", meHandler);
// パスワードリセット・メールアドレス確認（auth-email-flows）。
// 4つとも呼ばれる時点で access_token も csrf_secret も存在しないため、
// AUTH_EXEMPT_PATHS・CSRF_EXEMPT_PATHS（routeGuards.ts）の両方で除外している。
app.post("/api/auth/forgot-password", forgotPasswordHandler);
app.post("/api/auth/reset-password", resetPasswordHandler);
app.post("/api/auth/verify-email", verifyEmailHandler);
app.post("/api/auth/resend-confirmation", resendConfirmationHandler);

// ユーザー管理ルートは authMiddleware の後段でサーバーサイド RBAC を課す。
// 一括 use ではなく per-route で requireRole を付け、操作ごとに必要ロールを宣言する。
// パスは role 名前空間（/admin）を含めず /api/users/:id に統一（PATCH は admin/manager
// 双方が叩くため /admin だと破綻する）。細かい権限マトリクスは各ハンドラが強制する。
app.get("/api/users", requireRole(["admin", "manager"]), listUsersHandler);
app.patch("/api/users/:id", requireRole(["admin", "manager"]), updateUserHandler);
app.delete("/api/users/:id", requireRole(["admin"]), deleteUserHandler);

export default app;
