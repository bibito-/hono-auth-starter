import type { AuthUser } from "./AuthUser";

/**
 * メールアドレス確認（POST /api/auth/verify-email）の結果。
 * 成功時は login/signup と同様に Cookie・CSRF secret が発行され、そのままログイン状態になる。
 */
export type VerifyEmailResult =
  | { status: "verified"; user: AuthUser }
  | { status: "failure"; error: string };
