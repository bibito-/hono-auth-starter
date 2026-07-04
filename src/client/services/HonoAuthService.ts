import { AuthError } from "@client/entities/AuthErrors";
import { apiFetch } from "../lib/apiFetch";
import type { AuthUser } from "../entities/AuthUser";
import type { SigninResult } from "../entities/SigninResult";
import type { AuthService } from "./AuthService";

// apiFetch はプレーン関数で React の外（fetch 直前）から呼ばれるため、
// CSRF トークンは React Context ではなくモジュールレベル変数で保持する。
let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type LoginResponseBody = { user: AuthUser; csrf_token: string };
type LoginErrorBody = { error?: string };
type SignupResponseBody =
  | { status: "verified"; user: AuthUser; csrf_token: string }
  | { status: "pending" };
type MeResponseBody = { user: AuthUser; csrf_token: string };

/**
 * Hono 経由（/api/auth/*）で認証を管理するサービスクラス。
 * JWT は httpOnly Cookie としてサーバーが発行・管理するため、クライアントは
 * Supabase を直接叩かず、すべて apiFetch 経由で Hono のプロキシエンドポイントを呼ぶ。
 */
export class HonoAuthService implements AuthService {
  private callbacks: ((user: AuthUser | null) => void)[] = [];

  private notify(user: AuthUser | null) {
    this.callbacks.forEach((cb) => cb(user));
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}) as LoginErrorBody | LoginResponseBody);
    if (!res.ok) {
      throw new Error((data as LoginErrorBody).error ?? "ログインに失敗しました");
    }
    const { user, csrf_token } = data as LoginResponseBody;
    setCsrfToken(csrf_token);
    this.notify(user);
    return user;
  }

  async signin(email: string, password: string): Promise<SigninResult> {
    const res = await apiFetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      return { status: "failure", code: new AuthError("FAIL_CREATE_ACCOUNT") };
    }
    const data = (await res.json()) as SignupResponseBody;
    if (data.status === "pending") {
      return { status: "pending" };
    }
    setCsrfToken(data.csrf_token);
    this.notify(data.user);
    return { status: "verified", user: data.user };
  }

  async logout(): Promise<void> {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setCsrfToken(null);
    this.notify(null);
  }

  async getSession(): Promise<AuthUser | null> {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) {
      return null;
    }
    const { user, csrf_token } = (await res.json()) as MeResponseBody;
    setCsrfToken(csrf_token);
    return user;
  }

  onAuthStateChange(
    callback: (user: AuthUser | null) => void,
    _onError?: (error: unknown) => void
  ) {
    this.callbacks.push(callback);
    return {
      unsubscribe: () => {
        this.callbacks = this.callbacks.filter((cb) => cb !== callback);
      },
    };
  }
}
