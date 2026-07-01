import { Hono } from "hono";
import { authMiddleware } from "./server/middleware/auth";
import { requireRole } from "./server/middleware/requireRole";
import { corsMiddleware } from "./server/cors";
import { bodySizeLimitMiddleware } from "./server/middleware/bodySize";
import { deleteUserHandler } from "./server/handlers/deleteUser";
import { listUsersHandler } from "./server/handlers/listUsers";
import { updateUserHandler } from "./server/handlers/updateUser";
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
// Authorization ヘッダーのないプリフライトが authMiddleware で 401 になるのを防ぐ。
app.use("/api/*", corsMiddleware);
app.use("/api/*", authMiddleware);

// ユーザー管理ルートは authMiddleware の後段でサーバーサイド RBAC を課す。
// 一括 use ではなく per-route で requireRole を付け、操作ごとに必要ロールを宣言する。
// パスは role 名前空間（/admin）を含めず /api/users/:id に統一（PATCH は admin/manager
// 双方が叩くため /admin だと破綻する）。細かい権限マトリクスは各ハンドラが強制する。
app.get("/api/users", requireRole(["admin", "manager"]), listUsersHandler);
app.patch("/api/users/:id", requireRole(["admin", "manager"]), updateUserHandler);
app.delete("/api/users/:id", requireRole(["admin"]), deleteUserHandler);

export default app;
