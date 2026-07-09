import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, use } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../entities/AuthUser";
import type { AuthService } from "../services/AuthService";
import { showErrorToast, showSuccessToast } from "../utils/toastHelpers";
import { AuthContext } from "./AuthContext";
import { AuthErrorContext, type AuthErrorContextType } from "./AuthErrorContext";
import AuthServiceProvider from "./AuthServiceProvider";

vi.mock("../utils/toastHelpers", () => ({
  showErrorToast: vi.fn(),
  showConflictToast: vi.fn(),
  showRealtimeErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

const mockAuthErrorContext: AuthErrorContextType = {
  authError: null,
  handleError: vi.fn(),
};

const AUTH_USER: AuthUser = {
  id: "user-1",
  name: "テストユーザー",
  email: "user@example.com",
  role: "staff",
  username: "test_user",
};

function baseMockAuthService(): AuthService {
  return {
    onAuthStateChange: () => ({ unsubscribe: vi.fn() }),
    login: vi.fn().mockResolvedValue(null),
    signin: vi.fn().mockResolvedValue({ status: "failure" }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(null),
    forgotPassword: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue({ status: "reset" }),
    verifyEmail: vi.fn().mockResolvedValue({ status: "verified", user: AUTH_USER }),
    resendConfirmation: vi.fn().mockResolvedValue(undefined),
  };
}

// AuthContext の値を画面に出力し、テストから authUser の変化を検証するための子コンポーネント
function AuthContextConsumer() {
  const {
    authUser,
    verifyEmailMutation,
    resendConfirmationMutation,
    forgotPasswordMutation,
    resetPasswordMutation,
  } = use(AuthContext);
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "auth-user" }, authUser?.id ?? "null"),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => verifyEmailMutation.mutate({ tokenHash: "token-abc" }),
      },
      "verify"
    ),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => resendConfirmationMutation.mutate({ email: "user@example.com" }),
      },
      "resend"
    ),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => forgotPasswordMutation.mutate({ email: "user@example.com" }),
      },
      "forgot"
    ),
    createElement(
      "button",
      {
        type: "button",
        onClick: () =>
          resetPasswordMutation.mutate({ tokenHash: "token-abc", password: "Passw0rd" }),
      },
      "reset"
    )
  );
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthErrorContext.Provider, { value: mockAuthErrorContext }, children)
    );
}

describe("AuthServiceProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchProfile が失敗したとき showErrorToast を呼ぶ", async () => {
    // Render: onError を即座に呼ぶ AuthService モックで AuthServiceProvider をレンダー
    const mockAuthService: AuthService = {
      onAuthStateChange: (_callback, onError) => {
        setTimeout(() => onError?.(new Error("fetch failed")), 0);
        return { unsubscribe: vi.fn() };
      },
      login: vi.fn().mockResolvedValue(null),
      signin: vi.fn().mockResolvedValue({ status: "failure" }),
      logout: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(null),
      forgotPassword: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue({ status: "reset" }),
      verifyEmail: vi.fn().mockResolvedValue({ status: "failure", error: "invalid_or_expired_token" }),
      resendConfirmation: vi.fn().mockResolvedValue(undefined),
    };

    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement("div", null),
      }),
      { wrapper: createWrapper() }
    );

    // Assert
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("プロフィールの取得に失敗しました");
    });
  });

  it("verifyEmailMutation が verified を返したとき authUser を確立する", async () => {
    // Render: verifyEmail が verified を返す AuthService モックで AuthServiceProvider をレンダー
    const mockAuthService = baseMockAuthService();
    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement(AuthContextConsumer),
      }),
      { wrapper: createWrapper() }
    );
    // Arrange: verify ボタンを取得
    const verifyButton = await screen.findByRole("button", { name: "verify" });

    // Act
    await act(async () => {
      verifyButton.click();
    });

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId("auth-user").textContent).toBe(AUTH_USER.id);
    });
  });

  it("resendConfirmationMutation 成功時に showSuccessToast を呼ぶ", async () => {
    // Render: AuthServiceProvider をレンダー
    const mockAuthService = baseMockAuthService();
    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement(AuthContextConsumer),
      }),
      { wrapper: createWrapper() }
    );
    // Arrange: resend ボタンを取得
    const resendButton = await screen.findByRole("button", { name: "resend" });

    // Act
    await act(async () => {
      resendButton.click();
    });

    // Assert
    await waitFor(() => {
      expect(showSuccessToast).toHaveBeenCalledWith("確認メールを再送信しました");
    });
  });

  it("forgotPasswordMutation が通信例外で reject したとき showErrorToast を呼ぶ", async () => {
    // Render: forgotPassword が reject する AuthService モックで AuthServiceProvider をレンダー
    const mockAuthService = baseMockAuthService();
    mockAuthService.forgotPassword = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement(AuthContextConsumer),
      }),
      { wrapper: createWrapper() }
    );
    // Arrange: forgot ボタンを取得
    const forgotButton = await screen.findByRole("button", { name: "forgot" });

    // Act
    await act(async () => {
      forgotButton.click();
    });

    // Assert
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "パスワード再設定メールの送信に失敗しました",
        "network error"
      );
    });
  });

  it("resetPasswordMutation が通信例外で reject したとき showErrorToast を呼ぶ", async () => {
    // Render: resetPassword が reject する AuthService モックで AuthServiceProvider をレンダー
    const mockAuthService = baseMockAuthService();
    mockAuthService.resetPassword = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement(AuthContextConsumer),
      }),
      { wrapper: createWrapper() }
    );
    // Arrange: reset ボタンを取得
    const resetButton = await screen.findByRole("button", { name: "reset" });

    // Act
    await act(async () => {
      resetButton.click();
    });

    // Assert
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "パスワードの変更に失敗しました",
        "network error"
      );
    });
  });

  it("verifyEmailMutation が通信例外で reject したとき showErrorToast を呼ぶ", async () => {
    // Render: verifyEmail が reject する AuthService モックで AuthServiceProvider をレンダー
    const mockAuthService = baseMockAuthService();
    mockAuthService.verifyEmail = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement(AuthContextConsumer),
      }),
      { wrapper: createWrapper() }
    );
    // Arrange: verify ボタンを取得
    const verifyButton = await screen.findByRole("button", { name: "verify" });

    // Act
    await act(async () => {
      verifyButton.click();
    });

    // Assert
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "メールアドレスの確認に失敗しました",
        "network error"
      );
    });
  });

  it("resendConfirmationMutation が通信例外で reject したとき showErrorToast を呼ぶ", async () => {
    // Render: resendConfirmation が reject する AuthService モックで AuthServiceProvider をレンダー
    const mockAuthService = baseMockAuthService();
    mockAuthService.resendConfirmation = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      createElement(AuthServiceProvider, {
        authService: mockAuthService,
        children: createElement(AuthContextConsumer),
      }),
      { wrapper: createWrapper() }
    );
    // Arrange: resend ボタンを取得
    const resendButton = await screen.findByRole("button", { name: "resend" });

    // Act
    await act(async () => {
      resendButton.click();
    });

    // Assert
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "確認メールの再送信に失敗しました",
        "network error"
      );
    });
  });
});
