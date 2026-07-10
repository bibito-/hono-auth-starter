import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "../../contexts/AuthContext";
import Header from "./Header";

const mockLogoutMutate = vi.fn();
const mockSetTheme = vi.fn();
const mockUseTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => mockUseTheme(),
}));

function renderWithAuth(authValue: Partial<AuthServiceType>) {
  const defaultValue: AuthServiceType = {
    authUser: null,
    pendingEmail: null,
    loading: false,
    loginMutation: {} as AuthServiceType["loginMutation"],
    signinMutation: {} as AuthServiceType["signinMutation"],
    logoutMutation: { mutate: mockLogoutMutate } as unknown as AuthServiceType["logoutMutation"],
    forgotPasswordMutation: {} as AuthServiceType["forgotPasswordMutation"],
    resetPasswordMutation: {} as AuthServiceType["resetPasswordMutation"],
    verifyEmailMutation: {} as AuthServiceType["verifyEmailMutation"],
    resendConfirmationMutation: {} as AuthServiceType["resendConfirmationMutation"],
    ...authValue,
  };

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={defaultValue}>
        <Header />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe("Header", () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ theme: "light", setTheme: mockSetTheme });
  });

  it("未認証時、ログインリンクが header-ghost variant で /login へのリンクとして描画される", () => {
    // Arrange
    const authValue: Partial<AuthServiceType> = {
      authUser: null,
    };

    // Render: 未認証ユーザーでレンダリング
    renderWithAuth(authValue);

    // Assert
    const loginLink = screen.getByRole("link", { name: "ログイン" });
    expect(loginLink.getAttribute("href")).toBe("/login");
    expect(loginLink.getAttribute("data-variant")).toBe("header-ghost");
    // 未認証時はユーザー名表示自体が描画されない（既存挙動）
    expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();
  });

  it("認証時、ログアウトボタンが header-ghost variant で描画され、クリックで logoutMutation.mutate が呼ばれる", () => {
    // Arrange
    const authValue: Partial<AuthServiceType> = {
      authUser: { id: "1", name: "Test", email: "test@example.com", role: "staff", username: "testuser" },
    };

    // Render: 認証済みユーザーでレンダリング
    renderWithAuth(authValue);
    // Arrange: ログアウトボタンを取得
    const logoutButton = screen.getByRole("button", { name: "ログアウト" });

    // Act
    fireEvent.click(logoutButton);

    // Assert
    expect(logoutButton.getAttribute("data-variant")).toBe("header-ghost");
    expect(mockLogoutMutate).toHaveBeenCalled();
    expect(screen.getByText("testuserさん")).not.toBeNull();
  });

  it("ライトテーマ時、テーマ切り替えボタンに Moon アイコンが表示される", () => {
    // Render: ライトテーマとして useTheme をモックしてレンダリング
    mockUseTheme.mockReturnValue({ theme: "light", setTheme: mockSetTheme });
    renderWithAuth({ authUser: null });

    // Assert
    const themeButton = screen.getByRole("button", { name: "ダークテーマに切り替え" });
    expect(themeButton.querySelector("svg.lucide-moon")).not.toBeNull();
    expect(themeButton.querySelector("svg.lucide-sun")).toBeNull();
  });

  it("ダークテーマ時、テーマ切り替えボタンに Sun アイコンが表示される", () => {
    // Render: ダークテーマとして useTheme をモックしてレンダリング
    mockUseTheme.mockReturnValue({ theme: "dark", setTheme: mockSetTheme });
    renderWithAuth({ authUser: null });

    // Assert
    const themeButton = screen.getByRole("button", { name: "ライトテーマに切り替え" });
    expect(themeButton.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(themeButton.querySelector("svg.lucide-moon")).toBeNull();
  });

  it("テーマ切り替えボタンをクリックすると setTheme が反対のテーマで呼ばれる", () => {
    // Render: ライトテーマとして useTheme をモックしてレンダリング
    mockUseTheme.mockReturnValue({ theme: "light", setTheme: mockSetTheme });
    renderWithAuth({ authUser: null });
    // Arrange: テーマ切り替えボタンを取得
    const themeButton = screen.getByRole("button", { name: "ダークテーマに切り替え" });

    // Act
    fireEvent.click(themeButton);

    // Assert
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("未認証時でもテーマ切り替えボタンが表示される", () => {
    // Render: レンダリング
    renderWithAuth({ authUser: null });

    // Assert
    expect(screen.getByRole("button", { name: "ダークテーマに切り替え" })).not.toBeNull();
  });
});
