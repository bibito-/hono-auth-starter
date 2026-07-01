import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../services/AuthService";
import { showErrorToast } from "../utils/toastHelpers";
import { AuthErrorContext, type AuthErrorContextType } from "./AuthErrorContext";
import AuthServiceProvider from "./AuthServiceProvider";

vi.mock("../utils/toastHelpers", () => ({
  showErrorToast: vi.fn(),
  showConflictToast: vi.fn(),
  showRealtimeErrorToast: vi.fn(),
}));

const mockAuthErrorContext: AuthErrorContextType = {
  authError: null,
  handleError: vi.fn(),
};

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
});
