import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/apiFetch";
import type { AuthUser } from "../entities/AuthUser";

// apiFetch をモックする
vi.mock("../lib/apiFetch", () => ({ apiFetch: vi.fn() }));

import { HonoAuthService, getCsrfToken, setCsrfToken } from "./HonoAuthService";

const mockApiFetch = vi.mocked(apiFetch);

const AUTH_USER: AuthUser = {
  id: "user-1",
  name: "テストユーザー",
  email: "user@example.com",
  role: "staff",
  username: "test_user",
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("HonoAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCsrfToken(null);
  });

  describe("login", () => {
    it("成功時に /api/auth/login を呼び csrf_token を保持しつつ user を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ user: AUTH_USER, csrf_token: "csrf-abc" }));
      const service = new HonoAuthService();

      // Act
      const user = await service.login("user@example.com", "password");

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "password" }),
      });
      expect(user).toEqual(AUTH_USER);
      expect(getCsrfToken()).toBe("csrf-abc");
    });

    it("成功時に購読者へ notify する", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ user: AUTH_USER, csrf_token: "csrf-abc" }));
      const service = new HonoAuthService();
      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Act
      await service.login("user@example.com", "password");

      // Assert
      expect(callback).toHaveBeenCalledWith(AUTH_USER);
    });

    it("401 のとき Error を throw する", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ error: "invalid_credentials" }, false, 401));
      const service = new HonoAuthService();

      // Act / Assert
      await expect(service.login("user@example.com", "wrong")).rejects.toThrow();
    });
  });

  describe("signin", () => {
    it("status: pending のときそのまま返し notify しない", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ status: "pending" }));
      const service = new HonoAuthService();
      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Act
      const result = await service.signin("user@example.com", "password");

      // Assert
      expect(result).toEqual({ status: "pending" });
      expect(callback).not.toHaveBeenCalled();
    });

    it("status: verified のとき csrf_token を保持しつつ notify し user を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(
        jsonResponse({ status: "verified", user: AUTH_USER, csrf_token: "csrf-xyz" }),
      );
      const service = new HonoAuthService();
      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Act
      const result = await service.signin("user@example.com", "password");

      // Assert
      expect(result).toEqual({ status: "verified", user: AUTH_USER });
      expect(callback).toHaveBeenCalledWith(AUTH_USER);
      expect(getCsrfToken()).toBe("csrf-xyz");
    });

    it("400 failure のとき AuthError(FAIL_CREATE_ACCOUNT) を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ status: "failure", error: "account_exists" }, false, 400));
      const service = new HonoAuthService();

      // Act
      const result = await service.signin("user@example.com", "password");

      // Assert
      expect(result.status).toBe("failure");
      expect(result.status === "failure" && result.code.code).toBe("FAIL_CREATE_ACCOUNT");
    });
  });

  describe("logout", () => {
    it("/api/auth/logout を POST で呼び、csrf_token をリセットし notify(null) する", async () => {
      // Arrange: 事前に csrf_token をセットしておく
      setCsrfToken("csrf-existing");
      mockApiFetch.mockResolvedValue(jsonResponse({}));
      const service = new HonoAuthService();
      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Act
      await service.logout();

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
      expect(getCsrfToken()).toBeNull();
      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe("getSession", () => {
    it("200 のとき csrf_token を保持しつつ user を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ user: AUTH_USER, csrf_token: "csrf-me" }));
      const service = new HonoAuthService();

      // Act
      const user = await service.getSession();

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/me");
      expect(user).toEqual(AUTH_USER);
      expect(getCsrfToken()).toBe("csrf-me");
    });

    it("401 のとき null を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({}, false, 401));
      const service = new HonoAuthService();

      // Act
      const user = await service.getSession();

      // Assert
      expect(user).toBeNull();
    });
  });

  describe("forgotPassword", () => {
    it("/api/auth/forgot-password を POST で呼ぶ", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ status: "sent" }));
      const service = new HonoAuthService();

      // Act
      await service.forgotPassword("user@example.com");

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
    });
  });

  describe("resetPassword", () => {
    it("成功時に { status: 'reset' } を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ status: "reset" }));
      const service = new HonoAuthService();

      // Act
      const result = await service.resetPassword("token-abc", "NewPass1");

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: "token-abc", password: "NewPass1" }),
      });
      expect(result).toEqual({ status: "reset" });
    });

    it("400 のとき { status: 'failure', error } を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(
        jsonResponse({ status: "failure", error: "invalid_or_expired_token" }, false, 400),
      );
      const service = new HonoAuthService();

      // Act
      const result = await service.resetPassword("token-abc", "weak");

      // Assert
      expect(result).toEqual({ status: "failure", error: "invalid_or_expired_token" });
    });
  });

  describe("verifyEmail", () => {
    it("成功時に csrf_token を保持しつつ notify し { status: 'verified', user } を返す", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(
        jsonResponse({ status: "verified", user: AUTH_USER, csrf_token: "csrf-verify" }),
      );
      const service = new HonoAuthService();
      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Act
      const result = await service.verifyEmail("token-signup");

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: "token-signup" }),
      });
      expect(result).toEqual({ status: "verified", user: AUTH_USER });
      expect(getCsrfToken()).toBe("csrf-verify");
      expect(callback).toHaveBeenCalledWith(AUTH_USER);
    });

    it("400 のとき { status: 'failure', error } を返し notify しない", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(
        jsonResponse({ status: "failure", error: "invalid_or_expired_token" }, false, 400),
      );
      const service = new HonoAuthService();
      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Act
      const result = await service.verifyEmail("token-signup");

      // Assert
      expect(result).toEqual({ status: "failure", error: "invalid_or_expired_token" });
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("resendConfirmation", () => {
    it("/api/auth/resend-confirmation を POST で呼ぶ", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ status: "sent" }));
      const service = new HonoAuthService();

      // Act
      await service.resendConfirmation("user@example.com");

      // Assert
      expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
    });
  });

  describe("onAuthStateChange", () => {
    it("unsubscribe すると以降 notify されない", async () => {
      // Arrange
      mockApiFetch.mockResolvedValue(jsonResponse({ user: AUTH_USER, csrf_token: "csrf-abc" }));
      const service = new HonoAuthService();
      const callback = vi.fn();
      const { unsubscribe } = service.onAuthStateChange(callback);

      // Act
      unsubscribe();
      await service.login("user@example.com", "password");

      // Assert
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
