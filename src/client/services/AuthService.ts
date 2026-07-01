import type { AuthUser } from "../entities/AuthUser";
import type { SigninResult } from "../entities/SigninResult";

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
}
