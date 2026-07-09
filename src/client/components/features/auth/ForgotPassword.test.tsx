import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "@client/contexts/AuthContext";
import { ForgotPassword } from "./ForgotPassword";

const mockForgotPasswordMutate = vi.fn();

function renderPage(
  opts: { isSuccess?: boolean; isPending?: boolean; isError?: boolean } = {}
) {
  const { isSuccess = false, isPending = false, isError = false } = opts;
  const mockAuthContext = {
    forgotPasswordMutation: {
      mutate: mockForgotPasswordMutate,
      isPending,
      isSuccess,
      isError,
    },
  } as unknown as AuthServiceType;

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockAuthContext}>
        <ForgotPassword />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe("ForgotPassword", () => {
  beforeEach(() => {
    mockForgotPasswordMutate.mockClear();
  });

  it("メールアドレスを入力して送信すると forgotPasswordMutation.mutate を email 付きで呼ぶ", async () => {
    // Render: フォームをレンダリング
    renderPage();
    // Arrange: 入力欄と送信ボタンを取得
    const input = screen.getByLabelText("メールアドレス");
    const button = screen.getByRole("button", { name: "送信" });

    // Act
    fireEvent.change(input, { target: { value: "user@example.com" } });
    fireEvent.click(button);

    // Assert
    await waitFor(() => {
      expect(mockForgotPasswordMutate).toHaveBeenCalledWith({ email: "user@example.com" });
    });
  });

  it("メールアドレスが未入力のとき forgotPasswordMutation.mutate を呼ばない", async () => {
    // Render: フォームをレンダリング
    renderPage();
    // Arrange: 送信ボタンを取得
    const button = screen.getByRole("button", { name: "送信" });

    // Act
    fireEvent.click(button);

    // Assert
    await waitFor(() => {
      expect(screen.getByText("メールアドレスの形式で入力してください")).not.toBeNull();
    });
    expect(mockForgotPasswordMutate).not.toHaveBeenCalled();
  });

  it("isSuccess=true のとき送信完了メッセージを表示しフォームを表示しない", () => {
    // Render: isSuccess=true でレンダリング
    renderPage({ isSuccess: true });

    // Assert
    expect(screen.getByText("メールを送信しました")).not.toBeNull();
    expect(screen.queryByLabelText("メールアドレス")).toBeNull();
  });

  it("isError=true のとき送信失敗メッセージを表示しフォームは表示したままにする", () => {
    // Render: isError=true でレンダリング（apiFetch 自体が reject したケース）
    renderPage({ isError: true });

    // Assert
    expect(screen.getByText("送信に失敗しました。もう一度お試しください。")).not.toBeNull();
    expect(screen.getByLabelText("メールアドレス")).not.toBeNull();
  });

  it("ログインへ戻るリンクを /login へ張る", () => {
    // Render: フォームをレンダリング
    renderPage();
    // Arrange: リンクを取得
    const link = screen.getByRole("link", { name: "ログインへ戻る" });

    // Assert
    expect(link.getAttribute("href")).toBe("/login");
  });
});
