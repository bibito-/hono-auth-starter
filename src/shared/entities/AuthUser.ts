import type { UserRole } from "./UserRole";

/**
 * 認証プロキシ（/api/auth/*）のレスポンスに含める認証済みユーザー情報。
 * `src/client/entities/AuthUser.ts` と同型（クライアントは別途自身の型を持つ）。
 */
export type AuthUser = {
  id: string;
  name: string;
  email: string | undefined;
  role: UserRole | null;
  username: string | null;
};
