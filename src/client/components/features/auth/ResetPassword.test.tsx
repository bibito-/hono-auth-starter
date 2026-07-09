import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "@client/contexts/AuthContext";
import { ResetPassword } from "./ResetPassword";

const mockUseTokenHashParam = vi.fn();
vi.mock("@client/hooks/useTokenHashParam", () => ({
  useTokenHashParam: () => mockUseTokenHashParam(),
}));

const mockResetPasswordMutate = vi.fn();

function renderPage(
  opts: {
    tokenHash?: string | null;
    isPending?: boolean;
    isSuccess?: boolean;
    isError?: boolean;
    data?: unknown;
  } = {}
) {
  const {
    tokenHash = "token-abc",
    isPending = false,
    isSuccess = false,
    isError = false,
    data,
  } = opts;
  mockUseTokenHashParam.mockReturnValue(tokenHash);

  const mockAuthContext = {
    resetPasswordMutation: {
      mutate: mockResetPasswordMutate,
      isPending,
      isSuccess,
      isError,
      data,
    },
  } as unknown as AuthServiceType;

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockAuthContext}>
        <ResetPassword />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe("ResetPassword", () => {
  beforeEach(() => {
    mockResetPasswordMutate.mockClear();
    mockUseTokenHashParam.mockReset();
  });

  it("token_hash が無いとき無効リンクの案内を表示しフォームを表示しない", () => {
    // Render: tokenHash なしでレンダリング
    renderPage({ tokenHash: null });

    // Assert
    expect(screen.getByText("パスワードを変更できませんでした")).not.toBeNull();
    expect(screen.queryByLabelText("新しいパスワード")).toBeNull();
  });

  it("token_hash があるときフォームを表示する", () => {
    // Render: tokenHash ありでレンダリング
    renderPage();

    // Assert
    expect(screen.getByLabelText("新しいパスワード")).not.toBeNull();
  });

  it("有効なパスワードを送信すると resetPasswordMutation.mutate を tokenHash と password 付きで呼ぶ", async () => {
    // Render: フォームをレンダリング
    renderPage();
    // Arrange: 入力欄と送信ボタンを取得
    const input = screen.getByLabelText("新しいパスワード");
    const button = screen.getByRole("button", { name: "変更する" });

    // Act
    fireEvent.change(input, { target: { value: "Passw0rd" } });
    fireEvent.click(button);

    // Assert
    await waitFor(() => {
      expect(mockResetPasswordMutate).toHaveBeenCalledWith({
        tokenHash: "token-abc",
        password: "Passw0rd",
      });
    });
  });

  it("弱いパスワードのとき resetPasswordMutation.mutate を呼ばない", async () => {
    // Render: フォームをレンダリング
    renderPage();
    // Arrange: 入力欄と送信ボタンを取得
    const input = screen.getByLabelText("新しいパスワード");
    const button = screen.getByRole("button", { name: "変更する" });

    // Act
    fireEvent.change(input, { target: { value: "weak" } });
    fireEvent.click(button);

    // Assert
    await waitFor(() => {
      expect(screen.getByText("パスワードは6文字以上で入力してください")).not.toBeNull();
    });
    expect(mockResetPasswordMutate).not.toHaveBeenCalled();
  });

  it("成功時（status: reset）に変更完了メッセージと /login リンクを表示する", () => {
    // Render: isSuccess=true, status=reset でレンダリング
    renderPage({ isSuccess: true, data: { status: "reset" } });
    // Arrange: ログインへのリンクを取得
    const link = screen.getByRole("link", { name: "ログインへ" });

    // Assert
    expect(screen.getByText("変更しました。ログインしてください。")).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("失敗時（status: failure）にエラーメッセージと /forgot-password リンクを表示する", () => {
    // Render: isSuccess=true, status=failure でレンダリング
    renderPage({
      isSuccess: true,
      data: { status: "failure", error: "invalid_or_expired_token" },
    });
    // Arrange: パスワード再設定へのリンクを取得
    const link = screen.getByRole("link", { name: "パスワード再設定をやり直す" });

    // Assert
    expect(screen.getByText("invalid_or_expired_token")).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/forgot-password");
  });

  it("通信例外（isError）のとき変更失敗メッセージを表示しフォームは表示したままにする", () => {
    // Render: isError=true でレンダリング（apiFetch 自体が reject したケース。token 自体は
    // まだ有効な可能性があるため /forgot-password へは誘導せずフォームのまま再試行させる）
    renderPage({ isError: true });

    // Assert
    expect(screen.getByText("変更に失敗しました。もう一度お試しください。")).not.toBeNull();
    expect(screen.getByLabelText("新しいパスワード")).not.toBeNull();
  });
});
