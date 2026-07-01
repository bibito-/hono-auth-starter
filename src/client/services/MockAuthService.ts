import { AuthError } from "@client/entities/AuthErrors";
import type { AuthUser } from "../entities/AuthUser";
import type { AuthService } from "./AuthService";
import type { SigninResult } from "../entities/SigninResult";

const MOCK_USER: AuthUser = {
  id: "mock-user-id",
  name: "Mock User",
  email: "mock@example.com",
  role: "admin",
  username: "mock_user",
};

export class MockAuthService implements AuthService {
  private callbacks: ((user: AuthUser | null) => void)[] = [];

  private notify(user: AuthUser | null) {
    this.callbacks.forEach((cb) => cb(user));
  }

  async signin(_email: string, _password: string): Promise<SigninResult> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { status: "failure", code: new AuthError("FAIL_CREATE_ACCOUNT") };
  }

  async login(_email: string, _password: string): Promise<AuthUser> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.notify(MOCK_USER);
    return MOCK_USER;
  }

  async logout(): Promise<void> {
    this.notify(null);
  }

  async getSession(): Promise<AuthUser | null> {
    return null;
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void, _onError?: (error: unknown) => void) {
    this.callbacks.push(callback);
    setTimeout(() => callback(null), 0) //state 更新が同期的に走るタイミングの問題を避けるため
    return {
      unsubscribe: () => {
        this.callbacks = this.callbacks.filter((cb) => cb !== callback);
      },
    };
  }
}

