import type { UserRole } from "@shared/entities/UserRole";

/**
 * Hono の `c.set` / `c.get` で扱う Variables の型定義。
 * `role` は requireRole ミドルウェア通過後にのみセットされる（authMiddleware 単体では未設定）。
 */
export type AuthenticatedUser = {
  id: string;
  role?: UserRole;
};

export type HonoVariables = {
  user: AuthenticatedUser;
};
