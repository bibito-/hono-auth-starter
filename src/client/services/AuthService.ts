import type { AuthUser } from "../entities/AuthUser";
import type { SigninResult } from "../entities/SigninResult";
import type { ResetPasswordResult } from "../entities/ResetPasswordResult";
import type { VerifyEmailResult } from "../entities/VerifyEmailResult";

export interface AuthService {
  signin(email: string, password: string): Promise<SigninResult>;

  /**
   * ユーザーを認証するためのメソッド
   * @param email ユーザーのメールアドレス
   * @param password ユーザーのパスワード
   * @returns 認証されたユーザーの情報を含むPromise
   */
  login(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  /**
   * 現在のセッションに関連付けられたユーザー情報を取得するためのメソッド
   */
  getSession(): Promise<AuthUser | null>;
  onAuthStateChange(
    callback: (user: AuthUser | null) => void,
    onError?: (error: unknown) => void
  ): { unsubscribe: () => void };

  /**
   * パスワード再設定メールを送信する。メールアドレスの登録有無に関わらず常に成功として返る
   * （ユーザー列挙対策）。
   */
  forgotPassword(email: string): Promise<void>;
  /**
   * リカバリーリンクの token_hash と新パスワードでパスワードを更新する。
   * 成功してもログイン状態にはならない（サーバー側で全セッションを失効させるため）。
   */
  resetPassword(tokenHash: string, password: string): Promise<ResetPasswordResult>;
  /**
   * メール確認リンクの token_hash を検証する。成功時は login と同様に購読者へ notify し、
   * そのままログイン状態にする。
   */
  verifyEmail(tokenHash: string): Promise<VerifyEmailResult>;
  /**
   * 確認メールを再送する。メールアドレスの登録有無に関わらず常に成功として返る
   * （ユーザー列挙対策）。
   */
  resendConfirmation(email: string): Promise<void>;
}
