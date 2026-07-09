/**
 * パスワードリセット（POST /api/auth/reset-password）の結果。
 * 成功時も Cookie は発行されない（global signOut により全セッションが失効するため）。
 */
export type ResetPasswordResult =
  | { status: "reset" }
  | { status: "failure"; error: string };
